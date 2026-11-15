import { ExploreView } from "@/components/explore/explore-view";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Explorar pessoas, vídeos e fotos",
  description:
    "Descubra vídeos curtos, fotos, tags e criadores no velo. Explore o mundo em movimento por pessoa, lugar ou assunto.",
  path: "/explore",
  ogTitle: "Explorar · velo.",
});

export default function ExplorePage() {
  return <ExploreView />;
}
