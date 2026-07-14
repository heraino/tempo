declare module "fit-file-parser" {
  interface FitParserOptions {
    force?: boolean
    speedUnit?: string
    lengthUnit?: string
    temperatureUnit?: string
    elapsedRecordField?: boolean
    mode?: string
  }

  class FitParser {
    constructor(options?: FitParserOptions)
    parse(buffer: Buffer, callback: (err: string | null, data: unknown) => void): void
  }

  export default FitParser
}
