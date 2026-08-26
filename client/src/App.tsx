import { Suspense } from "react";
import { RouterProvider } from "react-router-dom";
import { PageFallback } from "@/components/PageFallback";
import { router } from "@/routes";

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
