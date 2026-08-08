# Manual recovery handoff

The read-only orchestrator never restores data, selects a backup location, rolls back a provider, or resumes a prior operation.

Use guidance only when the response identifies a symbolic backup and independently reports both identity and integrity evidence. Before taking a user-owned step, verify the target and evidence with the authoritative system. Stop on missing, failed, stale, or ambiguous evidence; do not choose a replacement backup or infer a path.

After any manual action, failed operation, or pending result, run a fresh assessment and request a new plan. A prior plan, displayed backup, or user report is not proof of current workstation state.
