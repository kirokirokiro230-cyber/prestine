export const CONTACT_TOPICS = [
  { value: "sizing", label: "Sizing and fit advice" },
  { value: "order", label: "An existing order" },
  { value: "returns", label: "Returns or exchanges" },
  { value: "repairs", label: "Repairs and alterations" },
  { value: "stock", label: "Restock enquiry" },
  { value: "wholesale", label: "Press or wholesale" },
  { value: "other", label: "Something else" },
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["value"];

export function isContactTopic(value: string): value is ContactTopic {
  return CONTACT_TOPICS.some((topic) => topic.value === value);
}

export function contactTopicLabel(topic: ContactTopic): string {
  return CONTACT_TOPICS.find((entry) => entry.value === topic)!.label;
}
