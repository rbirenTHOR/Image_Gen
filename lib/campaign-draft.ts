import { z } from "zod";

const draftSchema = z.object({
  text: z.string().max(6000),
  refs: z.array(z.string().min(1).max(100)).max(4),
  promptEdits: z.record(z.string().max(12000)),
  aspects: z.record(
    z.enum(["landscape_4_3", "landscape_16_9", "square_hd", "portrait_4_3"]),
  ),
});
export type CampaignDraft = z.infer<typeof draftSchema>;
export const campaignDraftKey = (projectId: string) =>
  "thor-studio:campaign-draft:" + projectId;
export function readCampaignDraft(projectId: string): CampaignDraft | null {
  try {
    const raw = sessionStorage.getItem(campaignDraftKey(projectId));
    if (!raw || raw.length > 500000) return null;
    const result = draftSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function writeCampaignDraft(projectId: string, draft: unknown) {
  try {
    const parsed = draftSchema.safeParse(draft);
    if (!parsed.success) return;
    sessionStorage.setItem(
      campaignDraftKey(projectId),
      JSON.stringify(parsed.data),
    );
  } catch {
    /* A full or disabled session store must not prevent sending or generation. */
  }
}
