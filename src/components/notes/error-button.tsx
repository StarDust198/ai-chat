"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorButton() {
  const [error, setError] = useState<Error | null>(null);
  if (error) throw error; // this runs during render → caught by boundary

  const handleError = () => {
    setError(new Error("Error has occurred"));
  };

  return <Button onClick={handleError}>Error Button</Button>;
}
