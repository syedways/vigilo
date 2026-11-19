import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://vigilo.syed.page",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "Vigilo",
      logo: { src: "./public/vigilo.svg" },
      favicon: "/vigilo.svg",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/syedways/vigilo" }],
      editLink: { baseUrl: "https://github.com/syedways/vigilo/edit/main/site/" },
      customCss: ["./src/styles/header.css", "./src/styles/home.css"],
      sidebar: [
        {
          label: "Start Here",
          // set `slug: docs/<page>` in each start-here page's frontmatter.
          items: [{ autogenerate: { directory: "start-here" } }],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "reference" } }],
        },
      ],
    }),
  ],
});
