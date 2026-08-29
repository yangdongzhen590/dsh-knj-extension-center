// CSS module type shim for the client bundle (tsdown compiles *.module.css).
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
