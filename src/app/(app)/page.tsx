import { FeedView } from "@/components/feed/feed-view";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";

export const metadata = buildPageMetadata({
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  path: "/",
});

export default function FeedPage() {
  return <FeedView />;
}
