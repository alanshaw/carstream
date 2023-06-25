# carstream

[![Build](https://github.com/alanshaw/carstream/actions/workflows/build.yml/badge.svg)](https://github.com/alanshaw/carstream/actions/workflows/build.yml)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/carstream)](https://bundlephobia.com/package/carstream)

Web stream CAR reader and writer.

## Install

```
npm install carstream
```

## Usage

### Read a CAR

```js
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { CARReaderStream } from 'carstream'

Readable.toWeb(fs.createReadStream('path/to/my.car'))
  .pipeThrough(new CARReaderStream())
  .pipeTo(new WritableStream({ write: block => console.log(block.cid.toString()) }))
```

### Write a CAR

```js
import fs from 'node:fs'
import { Writable } from 'node:stream'
import * as raw from 'multiformats/codecs/raw'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as Block from 'multiformats/block'
import { CARWriterStream } from 'carstream'

const readable = new ReadableStream({
  async pull (controller) {
    const block = await Block.encode({ value: new Uint8Array(), codec: raw, hasher })
    controller.enqueue(block)
    controller.close()
  }
})

await readable
  .pipeThrough(new CARWriterStream())
  .pipeTo(Writable.toWeb(fs.createWriteStream('path/to/my.car')))
```

## Contributing

Feel free to join in. All welcome. [Open an issue](https://github.com/alanshaw/carstream/issues)!

## License

Dual-licensed under [MIT / Apache 2.0](https://github.com/alanshaw/carstream/blob/main/LICENSE.md)
