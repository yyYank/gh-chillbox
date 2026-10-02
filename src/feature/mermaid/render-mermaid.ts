import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "default" });

// 各ブロックの中身を mermaid の図(SVG)に置き換える。構文エラーのブロックは元のまま残す
export async function renderMermaidBlocks(blocks: ArrayLike<Element>, idPrefix: string): Promise<void> {
  for (let i = 0; i < blocks.length; i++) {
    try {
      const id = `${idPrefix}-${i}-${Date.now()}`;
      const { svg } = await mermaid.render(id, blocks[i].textContent || "");
      blocks[i].innerHTML = svg;
      blocks[i].setAttribute("data-rendered", "true");
    } catch {
      /* keep raw text on parse error */
    }
  }
}
