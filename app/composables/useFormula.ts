// app/composables/useFormula.ts
import katex from 'katex'

export const useFormula = () => {
  function renderFormulas(html: string): string {
    if (!html) return ''

    let result = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
      try {
        return katex.renderToString(latex.trim(), {
          displayMode: true,
          throwOnError: false,
          strict: false,
        })
      } catch {
        return `<span class="text-red-500">[Формула: ${latex}]</span>`
      }
    })

    result = result.replace(/\$([^\$\n]+?)\$/g, (_, latex) => {
      try {
        return katex.renderToString(latex.trim(), {
          displayMode: false,
          throwOnError: false,
          strict: false,
        })
      } catch {
        return `<span class="text-red-500">[Формула: ${latex}]</span>`
      }
    })

    return result
  }

  return { renderFormulas }
}
