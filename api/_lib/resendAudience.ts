import { Resend } from "resend";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Adds a contact to the configured Audience, updating it when it already exists. */
export async function syncResendAudienceContact(
  submitterEmail: string,
  toolName: string,
): Promise<boolean> {
  const audienceId = process.env.RESEND_AUDIENCE_ID?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const email = submitterEmail.trim();
  const firstName = toolName.trim() || undefined;

  if (!audienceId) return false;
  if (!apiKey) {
    console.warn("Failed to sync contact to Resend Audience: RESEND_API_KEY is not configured.");
    return false;
  }
  if (!EMAIL_PATTERN.test(email)) {
    console.warn("Failed to sync contact to Resend Audience: submitter email is invalid.");
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error: createError } = await resend.contacts.create({
      email,
      firstName,
      unsubscribed: false,
      audienceId,
    });
    if (!createError) return true;

    const { data: existingContact, error: lookupError } = await resend.contacts.get({
      email,
      audienceId,
    });
    if (lookupError || !existingContact) {
      console.warn("Failed to sync contact to Resend Audience:", createError);
      return false;
    }

    const { error: updateError } = await resend.contacts.update({
      id: existingContact.id,
      audienceId,
      firstName,
      unsubscribed: false,
    });
    if (updateError) {
      console.warn("Failed to sync contact to Resend Audience:", updateError);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("Failed to sync contact to Resend Audience:", error);
    return false;
  }
}
