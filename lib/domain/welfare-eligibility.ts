export type EligibilityInput = {
  isActiveMember: boolean;
  tenureMonths: number;
  minTenureMonths: number;
  claimsThisYear: number;
  maxClaimsPerYear: number;
  lastRequestDate: string | null;
  cooldownDays: number;
  now: Date;
};

export type EligibilityResult = { eligible: true } | { eligible: false; reason: string };

export function checkMemberEligibility(input: EligibilityInput): EligibilityResult {
  if (!input.isActiveMember) {
    return { eligible: false, reason: "Only active members can request welfare assistance" };
  }
  if (input.tenureMonths < input.minTenureMonths) {
    return {
      eligible: false,
      reason: `Must be a member for at least ${input.minTenureMonths} month(s) before requesting welfare assistance`,
    };
  }
  if (input.maxClaimsPerYear > 0 && input.claimsThisYear >= input.maxClaimsPerYear) {
    return {
      eligible: false,
      reason: `Already reached the maximum of ${input.maxClaimsPerYear} welfare request(s) this year`,
    };
  }
  if (input.lastRequestDate && input.cooldownDays > 0) {
    const last = new Date(input.lastRequestDate);
    const daysSince = Math.floor((input.now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince < input.cooldownDays) {
      return {
        eligible: false,
        reason: `Must wait ${input.cooldownDays - daysSince} more day(s) before submitting another request`,
      };
    }
  }
  return { eligible: true };
}
