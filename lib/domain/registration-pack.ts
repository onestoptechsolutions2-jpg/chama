/**
 * The registration pack: the papers a group needs to register (Department
 * of Social Development / county), open a bank account or apply for an
 * M-Pesa Chama account — written from the group's own settings and rule
 * book, so they match how the group actually runs. Plain text sections;
 * the page lays them out for printing and signing.
 */
export type PackGroup = {
  name: string;
  description: string | null;
  meetingDay: string | null;
  meetingVenue: string | null;
  sharePrice: number;
  sharesPerMember: number;
  loansEnabled: boolean;
  mgrEnabled: boolean;
  welfareEnabled: boolean;
  loanInterestRate: number;
  loanMaxMultiplier: number;
  loanRepaymentMonths: number;
  loanMinGuarantors: number;
  fineLateness: number;
  fineAbsence: number;
  welfareFixedAmount: number | null;
};

export type PackRule = { ruleNumber: string; title: string | null; description: string };
export type Section = { heading: string; paragraphs: string[] };

const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString("en-KE")}`;

export function buildConstitution(group: PackGroup, rules: PackRule[]): Section[] {
  const sections: Section[] = [
    { heading: "1. Name", paragraphs: [`The name of the group shall be ${group.name} ("the Group").`] },
    {
      heading: "2. Objectives",
      paragraphs: [
        group.description ||
          "To bring members together to save regularly, support one another in times of need, and give members access to affordable credit.",
      ],
    },
    {
      heading: "3. Membership",
      paragraphs: [
        "Membership is open to any adult of good character who accepts this constitution and the rules of the Group, and is admitted by the officials.",
        "A member may leave by giving written notice. Their savings are refunded after any loan, fine or other debt owed to the Group is deducted.",
      ],
    },
    {
      heading: "4. Officials",
      paragraphs: [
        "The Group shall have a Chairperson, a Treasurer and a Secretary, elected by members at the Annual General Meeting for a term of one year, and eligible for re-election.",
        "The Chairperson leads meetings; the Treasurer keeps the Group's money and records; the Secretary keeps the minutes and the member register.",
        "No official may approve, pay out, waive or record repayment of money for themselves; another official must do it.",
      ],
    },
    {
      heading: "5. Meetings",
      paragraphs: [
        group.meetingDay
          ? `Ordinary meetings are held every ${group.meetingDay}${group.meetingVenue ? ` at ${group.meetingVenue}` : ""}.`
          : "Ordinary meetings are held at a time and place agreed by members.",
        "The Annual General Meeting is held once a year to receive the accounts, share out earnings where applicable, and elect officials. Half of all members form a quorum.",
      ],
    },
    {
      heading: "6. Contributions",
      paragraphs: [
        group.sharePrice > 0
          ? `Each member contributes ${ksh(group.sharePrice * group.sharesPerMember)} per period as savings (shares).`
          : "Members contribute the amounts agreed by the Group.",
        ...(group.welfareEnabled && group.welfareFixedAmount
          ? [`Each member also contributes ${ksh(group.welfareFixedAmount)} per period to the welfare fund.`]
          : []),
        "All money is paid into the Group's own bank account or M-Pesa paybill/till. Every payment is receipted to the member.",
      ],
    },
  ];

  let n = 7;
  if (group.loansEnabled) {
    sections.push({
      heading: `${n++}. Loans`,
      paragraphs: [
        `A member may borrow up to ${group.loanMaxMultiplier} times their savings, repayable within ${group.loanRepaymentMonths} months, at ${group.loanInterestRate}% interest.`,
        `Each loan needs at least ${group.loanMinGuarantors} guarantor(s) from among the members. A guarantor is liable for a defaulted loan.`,
      ],
    });
  }
  if (group.mgrEnabled) {
    sections.push({
      heading: `${n++}. Merry-go-round`,
      paragraphs: [
        "Members contribute an agreed amount each round, and each member in turn receives the pooled amount in the order agreed by the Group.",
      ],
    });
  }
  if (group.welfareEnabled) {
    sections.push({
      heading: `${n++}. Welfare`,
      paragraphs: [
        "The welfare fund supports members in times of bereavement, illness and emergency, as set out in the Group's benefit table and rules. Claims are approved by the officials.",
      ],
    });
  }
  if (group.fineLateness > 0 || group.fineAbsence > 0) {
    sections.push({
      heading: `${n++}. Fines`,
      paragraphs: [
        `Lateness to a meeting is fined ${ksh(group.fineLateness)} and absence without apology ${ksh(group.fineAbsence)}.`,
      ],
    });
  }
  if (rules.length) {
    sections.push({
      heading: `${n++}. Rules of the Group`,
      paragraphs: rules.map((r) => `${r.ruleNumber}. ${r.title ? `${r.title}: ` : ""}${r.description}`),
    });
  }
  sections.push(
    {
      heading: `${n++}. Money and records`,
      paragraphs: [
        "The Group's money is kept in an account in the Group's name. Withdrawals need the signatures (or approvals) of any two of the Chairperson, Treasurer and Secretary.",
        "Records of all contributions, loans, fines and payouts are kept and are open to every member.",
      ],
    },
    {
      heading: `${n++}. Changes and dissolution`,
      paragraphs: [
        "This constitution may be changed by two-thirds of members at a general meeting.",
        "If the Group is dissolved, its debts are paid first and the remaining money is shared among members in proportion to their savings.",
      ],
    },
  );
  return sections;
}

/** The resolution minutes a bank or Safaricom asks for, naming the signatories. */
export function buildResolutionMinutes(groupName: string, officials: { name: string; role: string }[]): Section[] {
  const signatories = officials.map((o) => `${o.name} (${o.role})`).join(", ") || "the Chairperson, Treasurer and Secretary";
  return [
    {
      heading: "Resolutions",
      paragraphs: [
        `1. That ${groupName} adopts the attached constitution.`,
        `2. That the Group applies for registration and opens an account in its own name (bank and/or M-Pesa paybill/till).`,
        `3. That the signatories to the account are ${signatories}, and that any two of them may authorise a withdrawal.`,
        "4. That all member payments are made into the Group's account, and recorded and receipted to each member.",
      ],
    },
  ];
}
