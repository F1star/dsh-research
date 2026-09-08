/** CSS module names provided by the browser bundle. */
declare module '*.module.css' {
  const names: Readonly<Record<string, string>>
  export default names
}
