import { AppProvider } from "@/lib/AppContext";
import { ContentIdeaAgent } from "@/components/ContentIdeaAgent";

export default function Home() {
  return (
    <AppProvider>
      <ContentIdeaAgent />
    </AppProvider>
  );
}
