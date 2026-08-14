import { AuthGate } from "@/components/AuthGate";
import { AppProvider } from "@/lib/AppContext";
import { ContentIdeaAgent } from "@/components/ContentIdeaAgent";

export default function Home() {
  return (
    <AuthGate>
      <AppProvider>
        <ContentIdeaAgent />
      </AppProvider>
    </AuthGate>
  );
}
