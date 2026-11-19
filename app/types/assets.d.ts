// Ассеты, импортируемые через бандлер (Vite): `import url from '...?url'`.
declare module '*.ttf?url' {
  const url: string
  export default url
}
