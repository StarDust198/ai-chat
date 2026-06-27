import { Chat } from "@/components/chat/chat";
import { anthropicApi } from "@/lib/api/anthropic";

export default async function Page() {
  await new Promise((res) => {
    setTimeout(res, 5000);
  });
  const models = await anthropicApi.getModels();

  return <Chat models={models.data} />;
}
