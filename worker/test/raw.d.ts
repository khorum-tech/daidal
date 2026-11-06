// Vite's `?raw` imports: a file's text, for tests that check a config file in the repository.
declare module "*?raw" {
  const text: string;
  export default text;
}
