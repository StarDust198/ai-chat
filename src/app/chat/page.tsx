import { Chat } from "@/components/chat/chat";
import { anthropicApi } from "@/lib/api/anthropic";

export default async function Page() {
  const models = await anthropicApi.getModels();

  return <Chat models={models.data} />;
}
