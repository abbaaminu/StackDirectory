/** Starts a non-blocking Audience sync after a submission has been persisted. */
export function syncSubmittedToolToResend(
  toolId: string,
  accessToken: string,
): void {
  void fetch("/api/resend-audience", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ toolId }),
  })
    .then(async (response) => {
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        console.warn(
          "Failed to sync contact to Resend Audience:",
          result?.error ?? `HTTP ${response.status}`,
        );
      }
    })
    .catch((error: unknown) => {
      console.warn("Failed to sync contact to Resend Audience:", error);
    });
}
