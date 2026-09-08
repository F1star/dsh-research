/** Local typings for the consumed Citation.js 0.8 API; upstream publishes JavaScript without declarations. */
declare module '@citation-js/core' {
  export class Cite {
    constructor(data: readonly unknown[])
    format(format: 'bibtex'): string
  }
}
declare module '@citation-js/plugin-bibtex' {}
