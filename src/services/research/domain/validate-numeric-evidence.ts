export type NumericEvidenceInput = {
  currentValue: number | null;
  comparisonValue: number | null;
  changeRate: number | null;
  unit: string | null;
  comparisonBasis: string | null;
  coveragePeriod: string | null;
};

export type NumericEvidenceValidation = {
  valid: boolean;
  errors: string[];
};

export function validateNumericEvidence(input: NumericEvidenceInput): NumericEvidenceValidation {
  const errors: string[] = [];
  const hasAnyNumber = input.currentValue !== null || input.comparisonValue !== null || input.changeRate !== null;

  if (!hasAnyNumber) return { valid: true, errors };

  if (!input.unit?.trim()) errors.push('missing_unit');
  if (!input.comparisonBasis?.trim()) errors.push('missing_comparison_basis');
  if (!input.coveragePeriod?.trim()) errors.push('missing_coverage_period');

  if (input.currentValue !== null && input.comparisonValue !== null && input.changeRate !== null) {
    if (input.comparisonValue === 0) {
      errors.push('zero_comparison_value');
    } else {
      const calculated = (input.currentValue - input.comparisonValue) / input.comparisonValue;
      if (Math.abs(calculated - input.changeRate) > 0.0005) errors.push('change_rate_mismatch');
    }
  }

  return { valid: errors.length === 0, errors };
}
