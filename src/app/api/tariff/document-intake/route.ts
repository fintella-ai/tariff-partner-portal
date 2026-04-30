import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractFromPdf, extractFromImage } from "@/lib/document-intake";
import { lookupCombinedRate, calculateIeepaDuty, calculateInterest, checkEligibility, getRoutingBucket } from "@/lib/tariff-calculator";
import { runAudit, generateCleanCapeEntries, formatCapeCSV, generateAuditReportCSV, type AuditEntry } from "@/lib/tariff-audit";
import { classifyHtsCode, detectTariffStacking } from "@/lib/hts-classifier";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const partnerCode = (session.user as { partnerCode?: string }).partnerCode;
  if (!partnerCode) {
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  if (files.length > 10) {
    return NextResponse.json({ error: "Maximum 10 files per upload" }, { status: 400 });
  }

  const allRates = await prisma.ieepaRate.findMany();
  const quarterRates = await prisma.interestRate.findMany();
  const qRates = quarterRates.map((q) => ({
    startDate: q.startDate,
    endDate: q.endDate,
    rate: Number(q.nonCorporateRate),
  }));

  const extractionResults = [];
  const allExtractedEntries = [];
  const warnings: string[] = [];
  let importerName: string | null = null;

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type || "application/pdf";

    let result;
    if (mimeType === "application/pdf") {
      result = await extractFromPdf(base64);
    } else if (mimeType.startsWith("image/")) {
      result = await extractFromImage(base64, mimeType);
    } else {
      warnings.push(`Unsupported file type: ${file.name} (${mimeType})`);
      continue;
    }

    extractionResults.push({ fileName: file.name, ...result });
    allExtractedEntries.push(...result.entries);
    warnings.push(...result.warnings.map((w) => `${file.name}: ${w}`));

    if (!importerName && result.importerName) {
      importerName = result.importerName;
    }
  }

  if (allExtractedEntries.length === 0) {
    return NextResponse.json({
      success: false,
      entries: [],
      warnings: [...warnings, "No entries could be extracted from the uploaded documents"],
      extractionResults,
    });
  }

  const now = new Date();
  const calculatedEntries = allExtractedEntries.map((extracted, index) => {
    const countryCode = extracted.countryOfOrigin || "CN";
    const entryDate = extracted.entryDate ? new Date(extracted.entryDate) : now;
    const enteredValue = extracted.enteredValue || 0;

    const matchingRates = allRates.filter((r) => {
      if (r.countryCode.toUpperCase() !== countryCode.toUpperCase()) return false;
      if (r.effectiveDate > entryDate) return false;
      if (r.endDate && r.endDate < entryDate) return false;
      return true;
    });

    const rateLookup = lookupCombinedRate(matchingRates.map((r) => ({
      id: r.id,
      rateType: r.rateType,
      rate: r.rate,
      name: r.name,
      executiveOrder: r.executiveOrder,
      countryCode: r.countryCode,
      effectiveDate: r.effectiveDate,
      endDate: r.endDate,
    })));

    const duty = calculateIeepaDuty(enteredValue, rateLookup.combinedRate);
    const interest = calculateInterest(duty, entryDate, now, qRates);
    const eligibility = checkEligibility({
      entryDate,
      entryType: extracted.entryType || "01",
      liquidationDate: extracted.liquidationDate ? new Date(extracted.liquidationDate) : undefined,
      isAdCvd: false,
    });
    const routingBucket = getRoutingBucket(eligibility.status);

    const htsClassification = extracted.htsCode
      ? classifyHtsCode(extracted.htsCode, countryCode, [])
      : null;
    const tariffStacking = extracted.htsCode
      ? detectTariffStacking(extracted.htsCode, countryCode, [])
      : null;

    return {
      index,
      entryNumber: extracted.entryNumber,
      countryOfOrigin: countryCode,
      entryDate: entryDate.toISOString().slice(0, 10),
      enteredValue,
      entryType: extracted.entryType || "01",
      htsCode: extracted.htsCode,
      importerName: extracted.importerName || importerName,
      importerNumber: extracted.importerNumber,
      filerCode: extracted.filerCode,
      htsClassification: htsClassification ? {
        description: htsClassification.description,
        programs: htsClassification.programs.map((p) => p.name),
        ieepaApplicable: htsClassification.ieepaApplicable,
        notes: htsClassification.notes,
      } : null,
      tariffStacking: tariffStacking?.isStacked ? {
        programs: tariffStacking.programs,
        totalRate: tariffStacking.totalRate,
        warning: tariffStacking.warning,
      } : null,
      combinedRate: rateLookup.combinedRate,
      rateBreakdown: rateLookup.breakdown,
      estimatedDuty: duty,
      estimatedInterest: interest,
      estimatedRefund: duty + interest,
      eligibility: {
        status: eligibility.status,
        reason: eligibility.reason,
        deadlineDays: eligibility.deadlineDays,
        isUrgent: eligibility.isUrgent,
      },
      routingBucket,
      confidence: extracted.confidence,
      needsReview: extracted.confidence < 0.7,
    };
  });

  const auditEntries: AuditEntry[] = calculatedEntries.map((e) => ({
    entryNumber: e.entryNumber,
    entryDate: e.entryDate,
    entryType: e.entryType,
    countryOfOrigin: e.countryOfOrigin,
    enteredValue: e.enteredValue,
    ieepaRate: e.combinedRate,
    eligibility: e.eligibility.status,
  }));

  const auditResult = runAudit(auditEntries);
  const cleanEntries = generateCleanCapeEntries(auditEntries, auditResult);
  const capeCsv = cleanEntries.length > 0 ? formatCapeCSV(cleanEntries) : "";
  const auditReportCsv = generateAuditReportCSV(auditResult);

  const selfFile = calculatedEntries.filter((e) => e.routingBucket === "self_file");
  const needsLegal = calculatedEntries.filter((e) => e.routingBucket === "legal_required");
  const notApplicable = calculatedEntries.filter((e) => e.routingBucket === "not_applicable");
  const lowConfidence = calculatedEntries.filter((e) => e.needsReview);

  const totalRefund = calculatedEntries.reduce((s, e) => s + e.estimatedRefund, 0);
  const totalValue = calculatedEntries.reduce((s, e) => s + e.enteredValue, 0);

  return NextResponse.json({
    success: true,
    importerName,
    summary: {
      totalEntries: calculatedEntries.length,
      totalEnteredValue: Math.round(totalValue * 100) / 100,
      totalEstimatedRefund: Math.round(totalRefund * 100) / 100,
      selfFileCount: selfFile.length,
      selfFileRefund: Math.round(selfFile.reduce((s, e) => s + e.estimatedRefund, 0) * 100) / 100,
      needsLegalCount: needsLegal.length,
      needsLegalRefund: Math.round(needsLegal.reduce((s, e) => s + e.estimatedRefund, 0) * 100) / 100,
      notApplicableCount: notApplicable.length,
      lowConfidenceCount: lowConfidence.length,
      auditScore: auditResult.score,
      auditPassed: auditResult.passed,
      auditErrors: auditResult.summary.failed,
      auditWarnings: auditResult.summary.warnings,
    },
    entries: calculatedEntries,
    audit: {
      score: auditResult.score,
      passed: auditResult.passed,
      errors: auditResult.errors.map((c) => ({ message: c.message, fix: c.fix })),
      warnings: auditResult.warnings.map((c) => ({ message: c.message })),
    },
    filingPackage: {
      capeCsv,
      auditReportCsv,
      eligibleForCape: cleanEntries.length,
    },
    routing: {
      selfFile: selfFile.map((e) => e.index),
      needsLegal: needsLegal.map((e) => e.index),
      notApplicable: notApplicable.map((e) => e.index),
    },
    warnings,
    documentsProcessed: extractionResults.length,
  });
}
