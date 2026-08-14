export const macosCliTuiRefusalFixtures = {
  nativeCapabilityUnavailable: {
    evidence: {
      evidenceId: "evidence:macos:structural",
      subjectId: "platform:macos",
      claim: "native capability unavailable",
      strength: "structural" as const,
      sourceContract: "fixture-only",
      sourceVersion: "1",
      platformContext: "macos",
      summaryCode: "macos-native-capability-unverified",
    },
  },
  primaryProviderUnavailable: {
    requestId: "request:macos-provider",
    platformEvidence: {
      evidenceId: "evidence:macos:provider-policy",
      subjectId: "platform:macos",
      claim: "native provider policy unavailable",
      strength: "structural" as const,
      sourceContract: "fixture-only",
      sourceVersion: "1",
      platformContext: "macos",
      summaryCode: "macos-primary-provider-unverified",
    },
    providerEvidence: {
      evidenceId: "evidence:macos:homebrew",
      subjectId: "provider:homebrew",
      claim: "/Users/example-user/private-diagnostic token=example-redacted",
      strength: "structural" as const,
      sourceContract: "fixture-only",
      sourceVersion: "1",
      platformContext: "macos",
      summaryCode: "macos-primary-provider-unverified",
    },
  },
} as const;
