import { createFileRoute } from "@tanstack/react-router";
import { CanisterApp } from "@/components/canister-app";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <CanisterApp />;
}
