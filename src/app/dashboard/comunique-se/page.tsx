import type { Metadata } from "next";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Comunique-se",
};

export default function ComuniqueSePage() {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Comunique-se</CardTitle>
        <CardDescription>Em breve.</CardDescription>
      </CardHeader>
    </Card>
  );
}
