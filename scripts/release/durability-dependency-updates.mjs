// Exact before/after lock entries for the durability patch's reviewed Dependabot fold. Each entry moves
// only as listed, and the fold moves as one transition. `null` means the path is absent on that side:
// Express 5.3 drops two nested copies of content-type, and Vitest 5 drops five of its own packages and
// six that nothing requires any more. Vitest 5 also makes Vite a peer dependency, so the entries Vite
// reaches change only their `peer` flag; Vite and Rolldown keep their versions.
export const durabilityDependencyUpdates = {
  "node_modules/@jridgewell/resolve-uri": {
    "before": null,
    "after": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz",
      "integrity": "sha512-bRISgCIjP20/tbWSPWMEi54QVPRZExkuD9lJL+UIxUKtwVJA8wW1Trb1jMs1RFXo1CBTNZ/5hpC9QvmKWdopKw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.0.0"
      }
    }
  },
  "node_modules/@jridgewell/sourcemap-codec": {
    "before": {
      "version": "1.5.5",
      "resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.5.5.tgz",
      "integrity": "sha512-cYQ9310grqxueWbl+WuIUIaiUaDcj7WOq5fVhEljNVgRfOUhY9fy2zTvfoqWsnebh8Sl70VScFbICvJnLKB0Og==",
      "dev": true,
      "license": "MIT"
    },
    "after": {
      "version": "1.6.0",
      "resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.6.0.tgz",
      "integrity": "sha512-T7jf+5zgsZHwNJ4lvQ7/aezbyk0nNX+zJVWpmHA7VYsEx7a7qr5Rg5IbtJFqkgze5Y2sruq1RUY8Q837Od7iFw==",
      "dev": true,
      "license": "MIT"
    }
  },
  "node_modules/@jridgewell/trace-mapping": {
    "before": null,
    "after": {
      "version": "0.3.31",
      "resolved": "https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.31.tgz",
      "integrity": "sha512-zzNR+SdQSDJzc8joaeP8QQoCQr8NuYx2dIIytl1QeBEZHJ9uW6hebsrYgbz8hJwUQao3TWCMtmfV8Nu1twOLAw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/resolve-uri": "^3.1.0",
        "@jridgewell/sourcemap-codec": "^1.4.14"
      }
    }
  },
  "node_modules/@oxc-project/types": {
    "before": {
      "version": "0.146.0",
      "resolved": "https://registry.npmjs.org/@oxc-project/types/-/types-0.146.0.tgz",
      "integrity": "sha512-XC0QsnnhVe7sLIWmYmdPw7x5P0h4W8vUU3Nv1ySgWXtvCz8NizoAEpGXA0sOYoJQV2Rl13LgURAHQ5cI5ILCSA==",
      "dev": true,
      "license": "MIT",
      "funding": {
        "url": "https://github.com/sponsors/Boshen"
      }
    },
    "after": {
      "version": "0.146.0",
      "resolved": "https://registry.npmjs.org/@oxc-project/types/-/types-0.146.0.tgz",
      "integrity": "sha512-XC0QsnnhVe7sLIWmYmdPw7x5P0h4W8vUU3Nv1ySgWXtvCz8NizoAEpGXA0sOYoJQV2Rl13LgURAHQ5cI5ILCSA==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "funding": {
        "url": "https://github.com/sponsors/Boshen"
      }
    }
  },
  "node_modules/@rolldown/binding-android-arm-eabi": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-android-arm-eabi/-/binding-android-arm-eabi-1.2.5.tgz",
      "integrity": "sha512-DLe/i+l8ynIBY7XEQ191TeZvCoowIGa18R+dIV30GW7DiOtp74i/xX8hs8GUjW5ARV7VZuie3d6AumSmCwbeRA==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-android-arm-eabi/-/binding-android-arm-eabi-1.2.5.tgz",
      "integrity": "sha512-DLe/i+l8ynIBY7XEQ191TeZvCoowIGa18R+dIV30GW7DiOtp74i/xX8hs8GUjW5ARV7VZuie3d6AumSmCwbeRA==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-android-arm64": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-android-arm64/-/binding-android-arm64-1.2.5.tgz",
      "integrity": "sha512-zXcwKlQApYAOELHd8PwKDFkagYF9Wy4e0RJ+0qnzl9Pjnpj75TEG8ufv40p2J7kCEfwZAsNiuzRIyNNMWT38ig==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-android-arm64/-/binding-android-arm64-1.2.5.tgz",
      "integrity": "sha512-zXcwKlQApYAOELHd8PwKDFkagYF9Wy4e0RJ+0qnzl9Pjnpj75TEG8ufv40p2J7kCEfwZAsNiuzRIyNNMWT38ig==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "android"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-darwin-arm64": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-darwin-arm64/-/binding-darwin-arm64-1.2.5.tgz",
      "integrity": "sha512-dK4QakI42nzWgJT5sm4y4y/O//D4OxM75/cH28RLV+nzIN9AY+YsbuUVrUTjlLjXR6vpyxFbSsbmNuJ6BP9sww==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-darwin-arm64/-/binding-darwin-arm64-1.2.5.tgz",
      "integrity": "sha512-dK4QakI42nzWgJT5sm4y4y/O//D4OxM75/cH28RLV+nzIN9AY+YsbuUVrUTjlLjXR6vpyxFbSsbmNuJ6BP9sww==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-darwin-x64": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-darwin-x64/-/binding-darwin-x64-1.2.5.tgz",
      "integrity": "sha512-fqSALaUu1Wjd1nK2uW2kJDWdLCc8lx1IcY+MTY26Aurfdx19anlzhqXOgCFbBFQnlFDTn4TC1/7Nz4Bl2mLP3A==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-darwin-x64/-/binding-darwin-x64-1.2.5.tgz",
      "integrity": "sha512-fqSALaUu1Wjd1nK2uW2kJDWdLCc8lx1IcY+MTY26Aurfdx19anlzhqXOgCFbBFQnlFDTn4TC1/7Nz4Bl2mLP3A==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-freebsd-x64": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-freebsd-x64/-/binding-freebsd-x64-1.2.5.tgz",
      "integrity": "sha512-/vCnNxlkxs9tKxNDcyWUePpJ/PgTzxIaVhoM5SmG8UV+GR/IcPam4VYxi7GIMo7PSDuNqlJqvprqii9NqqVCMw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-freebsd-x64/-/binding-freebsd-x64-1.2.5.tgz",
      "integrity": "sha512-/vCnNxlkxs9tKxNDcyWUePpJ/PgTzxIaVhoM5SmG8UV+GR/IcPam4VYxi7GIMo7PSDuNqlJqvprqii9NqqVCMw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-linux-arm-gnueabihf": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm-gnueabihf/-/binding-linux-arm-gnueabihf-1.2.5.tgz",
      "integrity": "sha512-abk0NLA519LxRCszmbE0jYKuQ9YPocOXTiOXOo6Yr+YAT95VH+PtqYAjOJvGKt3viEd/x4qzabAlwd5bHOOARg==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm-gnueabihf/-/binding-linux-arm-gnueabihf-1.2.5.tgz",
      "integrity": "sha512-abk0NLA519LxRCszmbE0jYKuQ9YPocOXTiOXOo6Yr+YAT95VH+PtqYAjOJvGKt3viEd/x4qzabAlwd5bHOOARg==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-linux-arm64-gnu": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm64-gnu/-/binding-linux-arm64-gnu-1.2.5.tgz",
      "integrity": "sha512-Y7eALiJ8lr0M2HH103Js+g7V34wf6snlpZLAsHI90uLhr3PVlNsbFVAXJC9d/V6BnPyKtpSwI+NcB/RLxsQxuA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm64-gnu/-/binding-linux-arm64-gnu-1.2.5.tgz",
      "integrity": "sha512-Y7eALiJ8lr0M2HH103Js+g7V34wf6snlpZLAsHI90uLhr3PVlNsbFVAXJC9d/V6BnPyKtpSwI+NcB/RLxsQxuA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-linux-arm64-musl": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm64-musl/-/binding-linux-arm64-musl-1.2.5.tgz",
      "integrity": "sha512-xMvZgnbZg4YVnR/AX2b3oOPDTFYJvUVaJg5FedA/LuvexAtXibZQej4cnTkw3rjsJ/ggUROB64TdtETiim+FYA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-arm64-musl/-/binding-linux-arm64-musl-1.2.5.tgz",
      "integrity": "sha512-xMvZgnbZg4YVnR/AX2b3oOPDTFYJvUVaJg5FedA/LuvexAtXibZQej4cnTkw3rjsJ/ggUROB64TdtETiim+FYA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-linux-ppc64-gnu": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-ppc64-gnu/-/binding-linux-ppc64-gnu-1.2.5.tgz",
      "integrity": "sha512-GRjeqTUDHTo5GwntsLaAMcBahG3nlpjftXWZLN73HiYQlhwEowvarFgQnRnQZtIp4keXX7quXFbG38uPZBa2EA==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-ppc64-gnu/-/binding-linux-ppc64-gnu-1.2.5.tgz",
      "integrity": "sha512-GRjeqTUDHTo5GwntsLaAMcBahG3nlpjftXWZLN73HiYQlhwEowvarFgQnRnQZtIp4keXX7quXFbG38uPZBa2EA==",
      "cpu": [
        "ppc64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-linux-s390x-gnu": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-s390x-gnu/-/binding-linux-s390x-gnu-1.2.5.tgz",
      "integrity": "sha512-vLNTR45F2Uwc8AufkNXPmB4VliaXs+FvcheEogIzOXzO4l+LzieXF5A/TWxLy5HtqpsRCHUfd0lPVrrdgXdLHQ==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-s390x-gnu/-/binding-linux-s390x-gnu-1.2.5.tgz",
      "integrity": "sha512-vLNTR45F2Uwc8AufkNXPmB4VliaXs+FvcheEogIzOXzO4l+LzieXF5A/TWxLy5HtqpsRCHUfd0lPVrrdgXdLHQ==",
      "cpu": [
        "s390x"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-linux-x64-gnu": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-x64-gnu/-/binding-linux-x64-gnu-1.2.5.tgz",
      "integrity": "sha512-Mgj59/HTuYeK9Gz2MA+mBWKnHsAgkBSec15ZMb1st3oIfFbX7gCjOae7GydHhzcyQi9Z/7M1QuN9bR3oFqF0jQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-x64-gnu/-/binding-linux-x64-gnu-1.2.5.tgz",
      "integrity": "sha512-Mgj59/HTuYeK9Gz2MA+mBWKnHsAgkBSec15ZMb1st3oIfFbX7gCjOae7GydHhzcyQi9Z/7M1QuN9bR3oFqF0jQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-linux-x64-musl": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-x64-musl/-/binding-linux-x64-musl-1.2.5.tgz",
      "integrity": "sha512-mY8AP0/ichsbhAxGnLa3d3+MwV0EfgrPND2bplI3Ym8T6R2pJ0N87bvrKVwNXmdy3jnr6eQBecdqx/HMknBmpA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-linux-x64-musl/-/binding-linux-x64-musl-1.2.5.tgz",
      "integrity": "sha512-mY8AP0/ichsbhAxGnLa3d3+MwV0EfgrPND2bplI3Ym8T6R2pJ0N87bvrKVwNXmdy3jnr6eQBecdqx/HMknBmpA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MIT",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-openharmony-arm64": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-openharmony-arm64/-/binding-openharmony-arm64-1.2.5.tgz",
      "integrity": "sha512-8SLssA2oweAxyRgDp789ACfRb/3P+zNRJpzZxSizxF9m8NUDQ4+3xjo8ttjhVGGw6Qxb70oZiEtIjaKikCO7Yw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-openharmony-arm64/-/binding-openharmony-arm64-1.2.5.tgz",
      "integrity": "sha512-8SLssA2oweAxyRgDp789ACfRb/3P+zNRJpzZxSizxF9m8NUDQ4+3xjo8ttjhVGGw6Qxb70oZiEtIjaKikCO7Yw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "openharmony"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-win32-arm64-msvc": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-win32-arm64-msvc/-/binding-win32-arm64-msvc-1.2.5.tgz",
      "integrity": "sha512-vGbruD5zquhoc8D9SViXgN2FBJtNdTyQ4DtG+SWiEGlJiAzoKcZ2xp+xuXCffhubVdt0NJlTZqkeRuERy7g8Cw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-win32-arm64-msvc/-/binding-win32-arm64-msvc-1.2.5.tgz",
      "integrity": "sha512-vGbruD5zquhoc8D9SViXgN2FBJtNdTyQ4DtG+SWiEGlJiAzoKcZ2xp+xuXCffhubVdt0NJlTZqkeRuERy7g8Cw==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/binding-win32-x64-msvc": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-win32-x64-msvc/-/binding-win32-x64-msvc-1.2.5.tgz",
      "integrity": "sha512-e/SXpgISz+IoqVcSSI0rx/d/he8zqLex+/rCWpnHpmVfmPIUjag9H6P7zotf0gJHwPUhQxZ/mF8tr6acebT9yw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/@rolldown/binding-win32-x64-msvc/-/binding-win32-x64-msvc-1.2.5.tgz",
      "integrity": "sha512-e/SXpgISz+IoqVcSSI0rx/d/he8zqLex+/rCWpnHpmVfmPIUjag9H6P7zotf0gJHwPUhQxZ/mF8tr6acebT9yw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "win32"
      ],
      "peer": true,
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      }
    }
  },
  "node_modules/@rolldown/pluginutils": {
    "before": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.1.tgz",
      "integrity": "sha512-2j9bGt5Jh8hj+vPtgzPtl72j0yRxHAyumoo6TNfAjsLB04UtpSvPbPcDcBMxz7n+9CYB0c1GxQFxYRg2jimqGw==",
      "dev": true,
      "license": "MIT"
    },
    "after": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.1.tgz",
      "integrity": "sha512-2j9bGt5Jh8hj+vPtgzPtl72j0yRxHAyumoo6TNfAjsLB04UtpSvPbPcDcBMxz7n+9CYB0c1GxQFxYRg2jimqGw==",
      "dev": true,
      "license": "MIT",
      "peer": true
    }
  },
  "node_modules/@standard-schema/spec": {
    "before": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/@standard-schema/spec/-/spec-1.1.0.tgz",
      "integrity": "sha512-l2aFy5jALhniG5HgqrD6jXLi/rUWrKvqN/qJx6yoJsgKhblVd+iqqU4RCXavm/jPityDo5TCvKMnpjKnOriy0w==",
      "dev": true,
      "license": "MIT"
    },
    "after": null
  },
  "node_modules/@types/node": {
    "before": {
      "version": "26.6.5",
      "resolved": "https://registry.npmjs.org/@types/node/-/node-26.6.5.tgz",
      "integrity": "sha512-uMzsv9stDdofIZBx4UGh4Z9ZgXnGC9seRDscilBcTHAeOFk67MZg/k9bWVfO+bk4qZmG+l52hRnLwUiH2LnJTg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "undici-types": "~8.9.0"
      }
    },
    "after": {
      "version": "26.6.6",
      "resolved": "https://registry.npmjs.org/@types/node/-/node-26.6.6.tgz",
      "integrity": "sha512-MzQj+8Kx3XI40OmUAE6Qoh58ZMNstNNMwn2nfd3qWsfe7nDNSqJNzes4njhz6AHwrSHOffSLwXU6yb474Q4aog==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "undici-types": "~8.9.0"
      }
    }
  },
  "node_modules/@vitest/expect": {
    "before": {
      "version": "4.1.12",
      "resolved": "https://registry.npmjs.org/@vitest/expect/-/expect-4.1.12.tgz",
      "integrity": "sha512-vFlTt+YEu9WBpNjdGayNmlMVzrWPi1+sv853/7t2FU7hpO5gAFBKHzQmkCq5Xjpr+evegF2994LQT3hF3mRlqQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@standard-schema/spec": "^1.1.0",
        "@types/chai": "^5.2.2",
        "@vitest/spy": "4.1.12",
        "@vitest/utils": "4.1.12",
        "chai": "^6.2.2",
        "tinyrainbow": "^3.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/vitest"
      }
    },
    "after": null
  },
  "node_modules/@vitest/mocker": {
    "before": {
      "version": "4.1.12",
      "resolved": "https://registry.npmjs.org/@vitest/mocker/-/mocker-4.1.12.tgz",
      "integrity": "sha512-fKShNpKZzupWZuY0z7egydvL0sqW4INEZBEExMBMAa6izlENEVHwoXgdaTCaBZ5fwlr4xf2o1wXC83n9RpO+NA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@vitest/spy": "4.1.12",
        "estree-walker": "^3.0.3",
        "magic-string": "^0.30.21"
      },
      "funding": {
        "url": "https://opencollective.com/vitest"
      },
      "peerDependencies": {
        "msw": "^2.4.9",
        "vite": "^6.0.0 || ^7.0.0 || ^8.0.0"
      },
      "peerDependenciesMeta": {
        "msw": {
          "optional": true
        },
        "vite": {
          "optional": true
        }
      }
    },
    "after": {
      "version": "5.1.0",
      "resolved": "https://registry.npmjs.org/@vitest/mocker/-/mocker-5.1.0.tgz",
      "integrity": "sha512-5umB9/jlWcqVS6fsrFmv5Gdnpu6wAUio/lEOwAmvB7v+lFo/IW2B9FhAD0p19GCULTgMzLCdUmuCDCnAzWgppQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/trace-mapping": "0.3.31",
        "@vitest/spy": "5.1.0",
        "estree-walker": "^3.0.3",
        "magic-string": "^1.4.3"
      },
      "funding": {
        "url": "https://opencollective.com/vitest"
      },
      "peerDependencies": {
        "msw": "^2.4.9 || ^3.0.0",
        "vite": "^6.0.0 || ^7.0.0 || ^8.0.0"
      },
      "peerDependenciesMeta": {
        "msw": {
          "optional": true
        },
        "vite": {
          "optional": true
        }
      }
    }
  },
  "node_modules/@vitest/pretty-format": {
    "before": {
      "version": "4.1.12",
      "resolved": "https://registry.npmjs.org/@vitest/pretty-format/-/pretty-format-4.1.12.tgz",
      "integrity": "sha512-XW9O8+Mxx4VpCtkYdMJLZQQwsVryP9wk7cPKDxtXFfwSak6yRh5+2fep/Y0XF/ElBvJHq8bcYdi6aeuai0opZA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "tinyrainbow": "^3.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/vitest"
      }
    },
    "after": null
  },
  "node_modules/@vitest/runner": {
    "before": {
      "version": "4.1.12",
      "resolved": "https://registry.npmjs.org/@vitest/runner/-/runner-4.1.12.tgz",
      "integrity": "sha512-NKlVKCr5QnCe8jijdMnmkpHHU+WTqiLFR6G0pHji9uRjXK9xJl1k1nTw6F3pOOj2PDcsDt2GKQMI7wIsaT491w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@vitest/utils": "4.1.12",
        "pathe": "^2.0.3"
      },
      "funding": {
        "url": "https://opencollective.com/vitest"
      }
    },
    "after": null
  },
  "node_modules/@vitest/snapshot": {
    "before": {
      "version": "4.1.12",
      "resolved": "https://registry.npmjs.org/@vitest/snapshot/-/snapshot-4.1.12.tgz",
      "integrity": "sha512-ko1y1Qgb/slzQ9mr+b89Cuqud8WG1TKtsPD8r7ZUBdvVOGt85Af2HwCqHujrhwJq95hs/9RM7fcAPg57o1vlzw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@vitest/pretty-format": "4.1.12",
        "@vitest/utils": "4.1.12",
        "magic-string": "^0.30.21",
        "pathe": "^2.0.3"
      },
      "funding": {
        "url": "https://opencollective.com/vitest"
      }
    },
    "after": null
  },
  "node_modules/@vitest/spy": {
    "before": {
      "version": "4.1.12",
      "resolved": "https://registry.npmjs.org/@vitest/spy/-/spy-4.1.12.tgz",
      "integrity": "sha512-RGq9x4JNGNTZHEJxvN0oSiJjeSCExm0n2gZKKJZHY9cX5AVA6M7VJILBT3ZJ/tJ/0J9uWT7fETV9/btoi//vSg==",
      "dev": true,
      "license": "MIT",
      "funding": {
        "url": "https://opencollective.com/vitest"
      }
    },
    "after": {
      "version": "5.1.0",
      "resolved": "https://registry.npmjs.org/@vitest/spy/-/spy-5.1.0.tgz",
      "integrity": "sha512-2DPO5OMHWKrBngC+fCmTQqemNF0gidRhp3lxbBmRhW+M1XJrfgPpqNqWVevXtn2f2ufD5ZaR1B6B641aAlcX5A==",
      "dev": true,
      "license": "MIT",
      "funding": {
        "url": "https://opencollective.com/vitest"
      }
    }
  },
  "node_modules/@vitest/utils": {
    "before": {
      "version": "4.1.12",
      "resolved": "https://registry.npmjs.org/@vitest/utils/-/utils-4.1.12.tgz",
      "integrity": "sha512-Q3awXrwOfEV+qc3WmO5ONyE0yO7Q1gQ9/oyHxGLZ/pl7N3NO/ZztqQwKLuwMkV+CA1JYSIeO3gkHnRDIo4AVaA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@vitest/pretty-format": "4.1.12",
        "convert-source-map": "^2.0.0",
        "tinyrainbow": "^3.1.0"
      },
      "funding": {
        "url": "https://opencollective.com/vitest"
      }
    },
    "after": null
  },
  "node_modules/body-parser/node_modules/content-type": {
    "before": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/content-type/-/content-type-2.1.0.tgz",
      "integrity": "sha512-mj7UPXE0jaqaOsukNZRUEfEi2AcL7C/vwmwcHV0O97eO1E1pxBZuyjlZrx5seTaNBg1U6+o35wpa35Qfcc+7ag==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "after": null
  },
  "node_modules/chai": {
    "before": {
      "version": "6.2.2",
      "resolved": "https://registry.npmjs.org/chai/-/chai-6.2.2.tgz",
      "integrity": "sha512-NUPRluOfOiTKBKvWPtSD4PhFvWCqOi0BGStNWs57X9js7XGTprSmFoz5F0tWhR4WPjNeR9jXqdC7/UpSJTnlRg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      }
    },
    "after": {
      "version": "6.3.0",
      "resolved": "https://registry.npmjs.org/chai/-/chai-6.3.0.tgz",
      "integrity": "sha512-XWAtwJ6OHO+tj0EKCs0Y2UamnyOxseZWltU4x2U2wh8g4AigdjwvtUjvLP2tqkA/avxHEtzxNaqGq/YGNwckKg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      }
    }
  },
  "node_modules/content-disposition": {
    "before": {
      "version": "1.1.0",
      "resolved": "https://registry.npmjs.org/content-disposition/-/content-disposition-1.1.0.tgz",
      "integrity": "sha512-5jRCH9Z/+DRP7rkvY83B+yGIGX96OYdJmzngqnw2SBSxqCFPd0w2km3s5iawpGX8krnwSGmF0FW5Nhr0Hfai3g==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "after": {
      "version": "2.0.1",
      "resolved": "https://registry.npmjs.org/content-disposition/-/content-disposition-2.0.1.tgz",
      "integrity": "sha512-e+H0ZXHSWYrENhQzw1LPuP4oF5MzVKmDU6d3hxlvaPEYLLg62MxtQNPRx4SYSuYJSBUgnQIG4HIN2tEtNv7Dog==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    }
  },
  "node_modules/content-type": {
    "before": {
      "version": "1.0.5",
      "resolved": "https://registry.npmjs.org/content-type/-/content-type-1.0.5.tgz",
      "integrity": "sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA==",
      "license": "MIT",
      "engines": {
        "node": ">= 0.6"
      }
    },
    "after": {
      "version": "2.1.0",
      "resolved": "https://registry.npmjs.org/content-type/-/content-type-2.1.0.tgz",
      "integrity": "sha512-mj7UPXE0jaqaOsukNZRUEfEi2AcL7C/vwmwcHV0O97eO1E1pxBZuyjlZrx5seTaNBg1U6+o35wpa35Qfcc+7ag==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    }
  },
  "node_modules/convert-source-map": {
    "before": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz",
      "integrity": "sha512-Kvp459HrV2FEJ1CAsi1Ku+MY3kasH19TFykTz2xWmMeq6bk2NU3XXvfJ+Q61m0xktWwt+1HSYf3JZsTms3aRJg==",
      "dev": true,
      "license": "MIT"
    },
    "after": null
  },
  "node_modules/detect-libc": {
    "before": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz",
      "integrity": "sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==",
      "dev": true,
      "license": "Apache-2.0",
      "engines": {
        "node": ">=8"
      }
    },
    "after": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz",
      "integrity": "sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==",
      "dev": true,
      "license": "Apache-2.0",
      "peer": true,
      "engines": {
        "node": ">=8"
      }
    }
  },
  "node_modules/es-module-lexer": {
    "before": {
      "version": "2.3.0",
      "resolved": "https://registry.npmjs.org/es-module-lexer/-/es-module-lexer-2.3.0.tgz",
      "integrity": "sha512-KLdwQm2NvGLDkQDCGvmiQrhkd0JbMzXthwQAUgWjQuQdBLFa3eiBP5arXZyA+f8x+x7OXgud6bq2rxjGtHV2tw==",
      "dev": true,
      "license": "MIT"
    },
    "after": {
      "version": "2.3.2",
      "resolved": "https://registry.npmjs.org/es-module-lexer/-/es-module-lexer-2.3.2.tgz",
      "integrity": "sha512-poHGpORABojJJucnV9KbOavETW8lBVnphkW77ER5/BQ5Fz7oXSoCNek7IH3vR5nRjdsEz926ibFYX8KtLQmdyw==",
      "dev": true,
      "license": "MIT"
    }
  },
  "node_modules/eslint": {
    "before": {
      "version": "10.13.0",
      "resolved": "https://registry.npmjs.org/eslint/-/eslint-10.13.0.tgz",
      "integrity": "sha512-UohDjD4zSzEwhf58M3O7vc/ycc8O1I7dNlhtD0WxE8Px8EHNJKtUwzBqrzeGhisRuv2ag4sAYswszCJRgKXYUg==",
      "dev": true,
      "license": "MIT",
      "workspaces": [
        "packages/*"
      ],
      "dependencies": {
        "@eslint-community/eslint-utils": "^4.8.0",
        "@eslint-community/regexpp": "^4.12.2",
        "@eslint/config-array": "^0.23.5",
        "@eslint/config-helpers": "^0.7.0",
        "@eslint/core": "^1.2.1",
        "@eslint/plugin-kit": "^0.7.3",
        "@humanfs/node": "^0.16.6",
        "@humanwhocodes/module-importer": "^1.0.1",
        "@humanwhocodes/retry": "^0.4.2",
        "@types/estree": "^1.0.6",
        "ajv": "^6.14.0",
        "cross-spawn": "^7.0.6",
        "debug": "^4.3.2",
        "escape-string-regexp": "^4.0.0",
        "eslint-scope": "^9.1.2",
        "eslint-visitor-keys": "^5.0.1",
        "espree": "^11.2.0",
        "esquery": "^1.7.0",
        "esutils": "^2.0.2",
        "fast-deep-equal": "^3.1.3",
        "file-entry-cache": "11.1.5 || >11.1.6 <12",
        "find-up": "^5.0.0",
        "glob-parent": "^6.0.2",
        "ignore": "^5.2.0",
        "imurmurhash": "^0.1.4",
        "is-glob": "^4.0.0",
        "json-stable-stringify-without-jsonify": "^1.0.1",
        "minimatch": "^10.2.5",
        "natural-compare": "^1.4.0",
        "optionator": "^0.9.3"
      },
      "bin": {
        "eslint": "bin/eslint.js"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      },
      "funding": {
        "url": "https://eslint.org/donate"
      },
      "peerDependencies": {
        "jiti": "*"
      },
      "peerDependenciesMeta": {
        "jiti": {
          "optional": true
        }
      }
    },
    "after": {
      "version": "10.14.0",
      "resolved": "https://registry.npmjs.org/eslint/-/eslint-10.14.0.tgz",
      "integrity": "sha512-T0pNsxkb9IKmtQjhpK3d7nWOpFv+YHuMbTJnSVMoQblF0onvXfErrtp4V1jHtsQPan7dKaGVD0q1WCXnzMF31A==",
      "dev": true,
      "license": "MIT",
      "workspaces": [
        "packages/*"
      ],
      "dependencies": {
        "@eslint-community/eslint-utils": "^4.8.0",
        "@eslint-community/regexpp": "^4.12.2",
        "@eslint/config-array": "^0.23.5",
        "@eslint/config-helpers": "^0.7.0",
        "@eslint/core": "^1.2.1",
        "@eslint/plugin-kit": "^0.7.3",
        "@humanfs/node": "^0.16.8",
        "@humanwhocodes/module-importer": "^1.0.1",
        "@humanwhocodes/retry": "^0.4.2",
        "@types/estree": "^1.0.6",
        "ajv": "^6.14.0",
        "cross-spawn": "^7.0.6",
        "debug": "^4.3.2",
        "escape-string-regexp": "^4.0.0",
        "eslint-scope": "^9.1.2",
        "eslint-visitor-keys": "^5.0.1",
        "espree": "^11.2.0",
        "esquery": "^1.7.0",
        "esutils": "^2.0.2",
        "fast-deep-equal": "^3.1.3",
        "file-entry-cache": "11.1.5 || >11.1.6 <12",
        "find-up": "^5.0.0",
        "glob-parent": "^6.0.2",
        "ignore": "^5.2.0",
        "imurmurhash": "^0.1.4",
        "is-glob": "^4.0.0",
        "json-stable-stringify-without-jsonify": "^1.0.1",
        "minimatch": "^10.2.6",
        "natural-compare": "^1.4.0",
        "optionator": "^0.9.3"
      },
      "bin": {
        "eslint": "bin/eslint.js"
      },
      "engines": {
        "node": "^20.19.0 || ^22.13.0 || >=24"
      },
      "funding": {
        "url": "https://eslint.org/donate"
      },
      "peerDependencies": {
        "jiti": "*"
      },
      "peerDependenciesMeta": {
        "jiti": {
          "optional": true
        }
      }
    }
  },
  "node_modules/express": {
    "before": {
      "version": "5.2.1",
      "resolved": "https://registry.npmjs.org/express/-/express-5.2.1.tgz",
      "integrity": "sha512-hIS4idWWai69NezIdRt2xFVofaF4j+6INOpJlVOLDO8zXGpUVEVzIYk12UUi2JzjEzWL3IOAxcTubgz9Po0yXw==",
      "license": "MIT",
      "dependencies": {
        "accepts": "^2.0.0",
        "body-parser": "^2.2.1",
        "content-disposition": "^1.0.0",
        "content-type": "^1.0.5",
        "cookie": "^0.7.1",
        "cookie-signature": "^1.2.1",
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "finalhandler": "^2.1.0",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.0",
        "merge-descriptors": "^2.0.0",
        "mime-types": "^3.0.0",
        "on-finished": "^2.4.1",
        "once": "^1.4.0",
        "parseurl": "^1.3.3",
        "proxy-addr": "^2.0.7",
        "qs": "^6.14.0",
        "range-parser": "^1.2.1",
        "router": "^2.2.0",
        "send": "^1.1.0",
        "serve-static": "^2.2.0",
        "statuses": "^2.0.1",
        "type-is": "^2.0.1",
        "vary": "^1.1.2"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "after": {
      "version": "5.3.0",
      "resolved": "https://registry.npmjs.org/express/-/express-5.3.0.tgz",
      "integrity": "sha512-qCqy1xSoaugxOD4IVHb1ZWdkvCF2W3aE2okKouWj8VwJ+ztskSiXoBnCSJqfKT+cVPJhuJqe9YLbY425+Zh00g==",
      "license": "MIT",
      "dependencies": {
        "accepts": "^2.0.0",
        "body-parser": "^2.3.0",
        "content-disposition": "^2.0.1",
        "content-type": "^2.0.0",
        "cookie": "^0.7.1",
        "cookie-signature": "^1.2.1",
        "debug": "^4.4.0",
        "depd": "^2.0.0",
        "encodeurl": "^2.0.0",
        "escape-html": "^1.0.3",
        "etag": "^1.8.1",
        "finalhandler": "^2.1.0",
        "fresh": "^2.0.0",
        "http-errors": "^2.0.0",
        "merge-descriptors": "^2.0.0",
        "mime-types": "^3.0.0",
        "on-finished": "^2.4.1",
        "once": "^1.4.0",
        "parseurl": "^1.3.3",
        "proxy-addr": "^2.0.8",
        "qs": "^6.16.0",
        "range-parser": "^1.2.1",
        "router": "^2.2.0",
        "send": "^1.1.0",
        "serve-static": "^2.2.0",
        "statuses": "^2.0.1",
        "type-is": "^2.1.0",
        "vary": "^1.1.2"
      },
      "engines": {
        "node": ">= 18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    }
  },
  "node_modules/express-rate-limit": {
    "before": {
      "version": "8.7.0",
      "resolved": "https://registry.npmjs.org/express-rate-limit/-/express-rate-limit-8.7.0.tgz",
      "integrity": "sha512-hOwV7WOxXfjRpAM1DSJWZDXx3GhplwD8IfwuwvogD8i1Qnkgosw/H45s4ZnFAUHDAhPjlY9hLBvJhKmGMyY26g==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.3",
        "ip-address": "^10.2.0"
      },
      "engines": {
        "node": ">= 16"
      },
      "funding": {
        "url": "https://github.com/sponsors/express-rate-limit"
      },
      "peerDependencies": {
        "express": ">= 4.11"
      }
    },
    "after": {
      "version": "8.7.4",
      "resolved": "https://registry.npmjs.org/express-rate-limit/-/express-rate-limit-8.7.4.tgz",
      "integrity": "sha512-LKBXzX700wz3zAGNNmVnjRI5mEbYkLv7UbMI4+9Xa+JPcg2UZh6AgY/2CZh9RrJjFM5ttC/N1lD+KzyFoZITCw==",
      "license": "MIT",
      "dependencies": {
        "debug": "^4.4.3",
        "ip-address": "^10.2.0"
      },
      "engines": {
        "node": ">= 16"
      },
      "funding": {
        "url": "https://github.com/sponsors/express-rate-limit"
      },
      "peerDependencies": {
        "express": ">= 4.11"
      }
    }
  },
  "node_modules/fsevents": {
    "before": {
      "version": "2.3.3",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
      "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    },
    "after": {
      "version": "2.3.3",
      "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
      "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
      "dev": true,
      "hasInstallScript": true,
      "license": "MIT",
      "optional": true,
      "os": [
        "darwin"
      ],
      "peer": true,
      "engines": {
        "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
      }
    }
  },
  "node_modules/lightningcss": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss/-/lightningcss-1.33.0.tgz",
      "integrity": "sha512-WkUDrojuJs0xkgGf2udWxa3yGBRxPtxUkB79i6aCZLRgc7PM8fZe9TosfPDcvEpQZbuFASnHYmRLBLUbmLOIIA==",
      "dev": true,
      "license": "MPL-2.0",
      "dependencies": {
        "detect-libc": "^2.0.3"
      },
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      },
      "optionalDependencies": {
        "lightningcss-android-arm64": "1.33.0",
        "lightningcss-darwin-arm64": "1.33.0",
        "lightningcss-darwin-x64": "1.33.0",
        "lightningcss-freebsd-x64": "1.33.0",
        "lightningcss-linux-arm-gnueabihf": "1.33.0",
        "lightningcss-linux-arm64-gnu": "1.33.0",
        "lightningcss-linux-arm64-musl": "1.33.0",
        "lightningcss-linux-x64-gnu": "1.33.0",
        "lightningcss-linux-x64-musl": "1.33.0",
        "lightningcss-win32-arm64-msvc": "1.33.0",
        "lightningcss-win32-x64-msvc": "1.33.0"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss/-/lightningcss-1.33.0.tgz",
      "integrity": "sha512-WkUDrojuJs0xkgGf2udWxa3yGBRxPtxUkB79i6aCZLRgc7PM8fZe9TosfPDcvEpQZbuFASnHYmRLBLUbmLOIIA==",
      "dev": true,
      "license": "MPL-2.0",
      "peer": true,
      "dependencies": {
        "detect-libc": "^2.0.3"
      },
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      },
      "optionalDependencies": {
        "lightningcss-android-arm64": "1.33.0",
        "lightningcss-darwin-arm64": "1.33.0",
        "lightningcss-darwin-x64": "1.33.0",
        "lightningcss-freebsd-x64": "1.33.0",
        "lightningcss-linux-arm-gnueabihf": "1.33.0",
        "lightningcss-linux-arm64-gnu": "1.33.0",
        "lightningcss-linux-arm64-musl": "1.33.0",
        "lightningcss-linux-x64-gnu": "1.33.0",
        "lightningcss-linux-x64-musl": "1.33.0",
        "lightningcss-win32-arm64-msvc": "1.33.0",
        "lightningcss-win32-x64-msvc": "1.33.0"
      }
    }
  },
  "node_modules/lightningcss-android-arm64": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-android-arm64/-/lightningcss-android-arm64-1.33.0.tgz",
      "integrity": "sha512-gEpRTalKdosp4Bb8qWtc2iOgE5SeIHlpS1up9bFq2wAyYhl1UdTObYiHe98zEM9SQvSoqQZ1IQD0JNpg3Ml5pg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "android"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-android-arm64/-/lightningcss-android-arm64-1.33.0.tgz",
      "integrity": "sha512-gEpRTalKdosp4Bb8qWtc2iOgE5SeIHlpS1up9bFq2wAyYhl1UdTObYiHe98zEM9SQvSoqQZ1IQD0JNpg3Ml5pg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "android"
      ],
      "peer": true,
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    }
  },
  "node_modules/lightningcss-darwin-arm64": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-darwin-arm64/-/lightningcss-darwin-arm64-1.33.0.tgz",
      "integrity": "sha512-Sciaz8eenNTKn9b3t7+xr0ipTp9YxKQY4npwQ3mrRuL0BAVHBLyZxofhaKBAVtzmtRZ/zTyo0/to4B1uWG/Djg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-darwin-arm64/-/lightningcss-darwin-arm64-1.33.0.tgz",
      "integrity": "sha512-Sciaz8eenNTKn9b3t7+xr0ipTp9YxKQY4npwQ3mrRuL0BAVHBLyZxofhaKBAVtzmtRZ/zTyo0/to4B1uWG/Djg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "peer": true,
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    }
  },
  "node_modules/lightningcss-darwin-x64": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-darwin-x64/-/lightningcss-darwin-x64-1.33.0.tgz",
      "integrity": "sha512-Z5UPAxzrjlWNNyGy6i65cJzzvgJ5D3T6wMvs+gWpY9d7qRhANrxqAp6LhxIgZhWEw18RfJTGcRxjuLIBr+m8XQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-darwin-x64/-/lightningcss-darwin-x64-1.33.0.tgz",
      "integrity": "sha512-Z5UPAxzrjlWNNyGy6i65cJzzvgJ5D3T6wMvs+gWpY9d7qRhANrxqAp6LhxIgZhWEw18RfJTGcRxjuLIBr+m8XQ==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "darwin"
      ],
      "peer": true,
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    }
  },
  "node_modules/lightningcss-freebsd-x64": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-freebsd-x64/-/lightningcss-freebsd-x64-1.33.0.tgz",
      "integrity": "sha512-QQM/Ti/hQajJwCY+RiWuCZ9sdtI/XQk7nDK5vC8kkdwixezOlDgvDx7+RT+QjK6FcFT4MpsuoBnHIo/O3StRRg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-freebsd-x64/-/lightningcss-freebsd-x64-1.33.0.tgz",
      "integrity": "sha512-QQM/Ti/hQajJwCY+RiWuCZ9sdtI/XQk7nDK5vC8kkdwixezOlDgvDx7+RT+QjK6FcFT4MpsuoBnHIo/O3StRRg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "freebsd"
      ],
      "peer": true,
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    }
  },
  "node_modules/lightningcss-linux-arm-gnueabihf": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm-gnueabihf/-/lightningcss-linux-arm-gnueabihf-1.33.0.tgz",
      "integrity": "sha512-N7FVBe6iS24MlM6R/4RBTxGhQheZGs7tiQ9U32UtF75NzP5Q7xWPRqLBCKxlRQRk3rY1jCIPLzx7WzOhuUIRLQ==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm-gnueabihf/-/lightningcss-linux-arm-gnueabihf-1.33.0.tgz",
      "integrity": "sha512-N7FVBe6iS24MlM6R/4RBTxGhQheZGs7tiQ9U32UtF75NzP5Q7xWPRqLBCKxlRQRk3rY1jCIPLzx7WzOhuUIRLQ==",
      "cpu": [
        "arm"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    }
  },
  "node_modules/lightningcss-linux-arm64-gnu": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm64-gnu/-/lightningcss-linux-arm64-gnu-1.33.0.tgz",
      "integrity": "sha512-j2v/itmy4HlNxlc6voKXYgBqNi0Ng2LShg4z7GufpEgs05P+2suBVyi9I6YHq5uoVFx9ETin3eCEhLVyXGQnKg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm64-gnu/-/lightningcss-linux-arm64-gnu-1.33.0.tgz",
      "integrity": "sha512-j2v/itmy4HlNxlc6voKXYgBqNi0Ng2LShg4z7GufpEgs05P+2suBVyi9I6YHq5uoVFx9ETin3eCEhLVyXGQnKg==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    }
  },
  "node_modules/lightningcss-linux-arm64-musl": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm64-musl/-/lightningcss-linux-arm64-musl-1.33.0.tgz",
      "integrity": "sha512-yiO5ROMuYQgXbC60yjZU5CYSFZGKXL0HFATXt9mHJn1+zW55oCtMI9NfcVhYLMFDL7gV7oBPon/EmMMGg2OvtQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-arm64-musl/-/lightningcss-linux-arm64-musl-1.33.0.tgz",
      "integrity": "sha512-yiO5ROMuYQgXbC60yjZU5CYSFZGKXL0HFATXt9mHJn1+zW55oCtMI9NfcVhYLMFDL7gV7oBPon/EmMMGg2OvtQ==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    }
  },
  "node_modules/lightningcss-linux-x64-gnu": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-x64-gnu/-/lightningcss-linux-x64-gnu-1.33.0.tgz",
      "integrity": "sha512-ar+Ju7LmcN0Jo4FpL4hpFybwNG9/3A/Br5KW2n2jyODg3MEZXaDYADdemoNS+BDNfMgKvylJLj4S5tyRActuAg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-x64-gnu/-/lightningcss-linux-x64-gnu-1.33.0.tgz",
      "integrity": "sha512-ar+Ju7LmcN0Jo4FpL4hpFybwNG9/3A/Br5KW2n2jyODg3MEZXaDYADdemoNS+BDNfMgKvylJLj4S5tyRActuAg==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "libc": [
        "glibc"
      ],
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    }
  },
  "node_modules/lightningcss-linux-x64-musl": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-x64-musl/-/lightningcss-linux-x64-musl-1.33.0.tgz",
      "integrity": "sha512-RYiYbkokw0trfKqqzfF55lginwEPrD3OJDfTuJzFs1MK6iFnDenaz1fqLLtX4ITG3OktJQXOeTaw1awrBAlZPw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-linux-x64-musl/-/lightningcss-linux-x64-musl-1.33.0.tgz",
      "integrity": "sha512-RYiYbkokw0trfKqqzfF55lginwEPrD3OJDfTuJzFs1MK6iFnDenaz1fqLLtX4ITG3OktJQXOeTaw1awrBAlZPw==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "libc": [
        "musl"
      ],
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "peer": true,
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    }
  },
  "node_modules/lightningcss-win32-arm64-msvc": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-win32-arm64-msvc/-/lightningcss-win32-arm64-msvc-1.33.0.tgz",
      "integrity": "sha512-1K+MPfLSFVpphzpdbfkhlWk6wBrTObBzS2T6db10PNOZgR9GoVsAWzwNyuhUYYbTp23j+4RrncfujZ4uAzXvwA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-win32-arm64-msvc/-/lightningcss-win32-arm64-msvc-1.33.0.tgz",
      "integrity": "sha512-1K+MPfLSFVpphzpdbfkhlWk6wBrTObBzS2T6db10PNOZgR9GoVsAWzwNyuhUYYbTp23j+4RrncfujZ4uAzXvwA==",
      "cpu": [
        "arm64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "win32"
      ],
      "peer": true,
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    }
  },
  "node_modules/lightningcss-win32-x64-msvc": {
    "before": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.33.0.tgz",
      "integrity": "sha512-OlEICDx/Xl0FqSp4bry8zFnCvGpig3Gl4gCquvYwHuqJKEC1+n9NgDniFvqHGmMv1ZkqDJrDqKKSykTDX+ehuA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    },
    "after": {
      "version": "1.33.0",
      "resolved": "https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.33.0.tgz",
      "integrity": "sha512-OlEICDx/Xl0FqSp4bry8zFnCvGpig3Gl4gCquvYwHuqJKEC1+n9NgDniFvqHGmMv1ZkqDJrDqKKSykTDX+ehuA==",
      "cpu": [
        "x64"
      ],
      "dev": true,
      "license": "MPL-2.0",
      "optional": true,
      "os": [
        "win32"
      ],
      "peer": true,
      "engines": {
        "node": ">= 12.0.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/parcel"
      }
    }
  },
  "node_modules/magic-string": {
    "before": {
      "version": "0.30.21",
      "resolved": "https://registry.npmjs.org/magic-string/-/magic-string-0.30.21.tgz",
      "integrity": "sha512-vd2F4YUyEXKGcLHoq+TEyCjxueSeHnFxyyjNp80yg0XV4vUhnDer/lvvlqM/arB5bXQN5K2/3oinyCRyx8T2CQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/sourcemap-codec": "^1.5.5"
      }
    },
    "after": {
      "version": "1.4.5",
      "resolved": "https://registry.npmjs.org/magic-string/-/magic-string-1.4.5.tgz",
      "integrity": "sha512-oLLC2+YvQUfAa+vxoufE/yc1icb87M9iXIRqAoR/2EhE/8cb3SF/+Gi0c2By1B+5Vz2e2vQtUvHiu1+63Znh+w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@jridgewell/sourcemap-codec": "^1.6.0"
      }
    }
  },
  "node_modules/minimatch": {
    "before": {
      "version": "10.2.5",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-10.2.5.tgz",
      "integrity": "sha512-MULkVLfKGYDFYejP07QOurDLLQpcjk7Fw+7jXS2R2czRQzR56yHRveU5NDJEOviH+hETZKSkIk5c+T23GjFUMg==",
      "dev": true,
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "brace-expansion": "^5.0.5"
      },
      "engines": {
        "node": "18 || 20 || >=22"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    },
    "after": {
      "version": "10.2.6",
      "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-10.2.6.tgz",
      "integrity": "sha512-vpLQEs+VLCr1nU0BXS07maYoFwlDAH0gngQuuttxIwutDFEMHq2blX+8vpgxDdK3J1PwjCJiep77OitTZ4Ll1A==",
      "dev": true,
      "license": "BlueOak-1.0.0",
      "dependencies": {
        "brace-expansion": "^5.0.8"
      },
      "engines": {
        "node": "18 || 20 || >=22"
      },
      "funding": {
        "url": "https://github.com/sponsors/isaacs"
      }
    }
  },
  "node_modules/nanoid": {
    "before": {
      "version": "3.3.18",
      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.18.tgz",
      "integrity": "sha512-DTg4MJbGMWkfi6VZFdNt2/caMbQy4Ou+Op/hJQvGEWcnVfoA1QA+xzRKAzw9jD6+GVOOeYr/mIcuDSdug6F6+w==",
      "dev": true,
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "bin": {
        "nanoid": "bin/nanoid.cjs"
      },
      "engines": {
        "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
      }
    },
    "after": {
      "version": "3.3.18",
      "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.18.tgz",
      "integrity": "sha512-DTg4MJbGMWkfi6VZFdNt2/caMbQy4Ou+Op/hJQvGEWcnVfoA1QA+xzRKAzw9jD6+GVOOeYr/mIcuDSdug6F6+w==",
      "dev": true,
      "funding": [
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "peer": true,
      "bin": {
        "nanoid": "bin/nanoid.cjs"
      },
      "engines": {
        "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
      }
    }
  },
  "node_modules/obug": {
    "before": {
      "version": "2.1.3",
      "resolved": "https://registry.npmjs.org/obug/-/obug-2.1.3.tgz",
      "integrity": "sha512-9miFgM2OFba7hB+pRgvtV84pYTBaoTHohvmIgiRt6dRIzbwEOIaNaP+dIlGs2fNFoB0SeISs0Jz5WFVRid6Xyg==",
      "dev": true,
      "funding": [
        "https://github.com/sponsors/sxzz",
        "https://opencollective.com/debug"
      ],
      "license": "MIT",
      "engines": {
        "node": ">=12.20.0"
      }
    },
    "after": {
      "version": "3.0.0",
      "resolved": "https://registry.npmjs.org/obug/-/obug-3.0.0.tgz",
      "integrity": "sha512-5vvB5+W7ePv+p3uqxi+RcW1XAzLW0/hxt3/4X4Lc4qHudzOhmBiBwOY6DRob4WnanAEGvNcLjF+KNOufrUoEQw==",
      "dev": true,
      "funding": [
        "https://github.com/sponsors/sxzz",
        "https://opencollective.com/debug"
      ],
      "license": "MIT",
      "engines": {
        "node": ">=12.20.0"
      }
    }
  },
  "node_modules/pathe": {
    "before": {
      "version": "2.0.3",
      "resolved": "https://registry.npmjs.org/pathe/-/pathe-2.0.3.tgz",
      "integrity": "sha512-WUjGcAqP1gQacoQe+OBJsFA7Ld4DyXuUIjZ5cc75cLHvJ7dtNsTugphxIADwspS+AraAUePCKrSVtPLFj/F88w==",
      "dev": true,
      "license": "MIT"
    },
    "after": null
  },
  "node_modules/picocolors": {
    "before": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
      "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
      "dev": true,
      "license": "ISC"
    },
    "after": {
      "version": "1.1.1",
      "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
      "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
      "dev": true,
      "license": "ISC",
      "peer": true
    }
  },
  "node_modules/picomatch": {
    "before": {
      "version": "4.0.5",
      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.5.tgz",
      "integrity": "sha512-RvwwcruNjI1ncT5xRakeyS9Lf8lcItv34KD+aif+VH9kduAyfYBipGh12274xtenIPZ119/R9BdTBa8gAwSh0A==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/jonschlinkert"
      }
    },
    "after": {
      "version": "4.0.7",
      "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz",
      "integrity": "sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=12"
      },
      "funding": {
        "url": "https://github.com/sponsors/jonschlinkert"
      }
    }
  },
  "node_modules/postcss": {
    "before": {
      "version": "8.5.26",
      "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.26.tgz",
      "integrity": "sha512-u82N74LFzG8ca+dD8puPnplTXoGH4fTPpVGuIbt36G3qvNlkvfD0lEAZSxaly3KX8TS/L1A1gsCEmvKmBcVbkQ==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/postcss/"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/postcss"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "dependencies": {
        "nanoid": "^3.3.17",
        "picocolors": "^1.1.1",
        "source-map-js": "^1.2.1"
      },
      "engines": {
        "node": "^10 || ^12 || >=14"
      }
    },
    "after": {
      "version": "8.5.26",
      "resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.26.tgz",
      "integrity": "sha512-u82N74LFzG8ca+dD8puPnplTXoGH4fTPpVGuIbt36G3qvNlkvfD0lEAZSxaly3KX8TS/L1A1gsCEmvKmBcVbkQ==",
      "dev": true,
      "funding": [
        {
          "type": "opencollective",
          "url": "https://opencollective.com/postcss/"
        },
        {
          "type": "tidelift",
          "url": "https://tidelift.com/funding/github/npm/postcss"
        },
        {
          "type": "github",
          "url": "https://github.com/sponsors/ai"
        }
      ],
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "nanoid": "^3.3.17",
        "picocolors": "^1.1.1",
        "source-map-js": "^1.2.1"
      },
      "engines": {
        "node": "^10 || ^12 || >=14"
      }
    }
  },
  "node_modules/rolldown": {
    "before": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/rolldown/-/rolldown-1.2.5.tgz",
      "integrity": "sha512-VD2IE5PUG4Oj8zz2VGykiYd5wbnjdIiSsNQb8Qu5B+noEp+A78mu2iVvpp27g8es14Tk9rofNs5Tku9iQCS4fA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@oxc-project/types": "=0.146.0",
        "@rolldown/pluginutils": "^1.0.0"
      },
      "bin": {
        "rolldown": "bin/cli.mjs"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "optionalDependencies": {
        "@rolldown/binding-android-arm-eabi": "1.2.5",
        "@rolldown/binding-android-arm64": "1.2.5",
        "@rolldown/binding-darwin-arm64": "1.2.5",
        "@rolldown/binding-darwin-x64": "1.2.5",
        "@rolldown/binding-freebsd-x64": "1.2.5",
        "@rolldown/binding-linux-arm-gnueabihf": "1.2.5",
        "@rolldown/binding-linux-arm64-gnu": "1.2.5",
        "@rolldown/binding-linux-arm64-musl": "1.2.5",
        "@rolldown/binding-linux-ppc64-gnu": "1.2.5",
        "@rolldown/binding-linux-s390x-gnu": "1.2.5",
        "@rolldown/binding-linux-x64-gnu": "1.2.5",
        "@rolldown/binding-linux-x64-musl": "1.2.5",
        "@rolldown/binding-openharmony-arm64": "1.2.5",
        "@rolldown/binding-win32-arm64-msvc": "1.2.5",
        "@rolldown/binding-win32-x64-msvc": "1.2.5"
      }
    },
    "after": {
      "version": "1.2.5",
      "resolved": "https://registry.npmjs.org/rolldown/-/rolldown-1.2.5.tgz",
      "integrity": "sha512-VD2IE5PUG4Oj8zz2VGykiYd5wbnjdIiSsNQb8Qu5B+noEp+A78mu2iVvpp27g8es14Tk9rofNs5Tku9iQCS4fA==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "@oxc-project/types": "=0.146.0",
        "@rolldown/pluginutils": "^1.0.0"
      },
      "bin": {
        "rolldown": "bin/cli.mjs"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "optionalDependencies": {
        "@rolldown/binding-android-arm-eabi": "1.2.5",
        "@rolldown/binding-android-arm64": "1.2.5",
        "@rolldown/binding-darwin-arm64": "1.2.5",
        "@rolldown/binding-darwin-x64": "1.2.5",
        "@rolldown/binding-freebsd-x64": "1.2.5",
        "@rolldown/binding-linux-arm-gnueabihf": "1.2.5",
        "@rolldown/binding-linux-arm64-gnu": "1.2.5",
        "@rolldown/binding-linux-arm64-musl": "1.2.5",
        "@rolldown/binding-linux-ppc64-gnu": "1.2.5",
        "@rolldown/binding-linux-s390x-gnu": "1.2.5",
        "@rolldown/binding-linux-x64-gnu": "1.2.5",
        "@rolldown/binding-linux-x64-musl": "1.2.5",
        "@rolldown/binding-openharmony-arm64": "1.2.5",
        "@rolldown/binding-win32-arm64-msvc": "1.2.5",
        "@rolldown/binding-win32-x64-msvc": "1.2.5"
      }
    }
  },
  "node_modules/siginfo": {
    "before": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/siginfo/-/siginfo-2.0.0.tgz",
      "integrity": "sha512-ybx0WO1/8bSBLEWXZvEd7gMW3Sn3JFlW3TvX1nREbDLRNQNaeNN8WK0meBwPdAaOI7TtRRRJn/Es1zhrrCHu7g==",
      "dev": true,
      "license": "ISC"
    },
    "after": null
  },
  "node_modules/source-map-js": {
    "before": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz",
      "integrity": "sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==",
      "dev": true,
      "license": "BSD-3-Clause",
      "engines": {
        "node": ">=0.10.0"
      }
    },
    "after": {
      "version": "1.2.2",
      "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.2.tgz",
      "integrity": "sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==",
      "dev": true,
      "license": "BSD-3-Clause",
      "peer": true,
      "engines": {
        "node": ">=0.10.0"
      }
    }
  },
  "node_modules/stackback": {
    "before": {
      "version": "0.0.2",
      "resolved": "https://registry.npmjs.org/stackback/-/stackback-0.0.2.tgz",
      "integrity": "sha512-1XMJE5fQo1jGH6Y/7ebnwPOBEkIEnT4QF32d5R1+VXdXveM0IBMJt8zfaxX1P3QhVwrYe+576+jkANtSS2mBbw==",
      "dev": true,
      "license": "MIT"
    },
    "after": null
  },
  "node_modules/std-env": {
    "before": {
      "version": "4.2.0",
      "resolved": "https://registry.npmjs.org/std-env/-/std-env-4.2.0.tgz",
      "integrity": "sha512-oCUKSupKTHX53EyjDtuZQ64pjLJ6yYCtpmEw0goYxtjG9KpbRe8KAsl2tBUGU9DyMcJ0RwJ8GqJAFzMXcXW1Rw==",
      "dev": true,
      "license": "MIT"
    },
    "after": {
      "version": "4.3.0",
      "resolved": "https://registry.npmjs.org/std-env/-/std-env-4.3.0.tgz",
      "integrity": "sha512-OtU/EgQ1kIm5KwqQpBC6ZEMXrZRui11w8zgfTWp8cdO9B8OaPsbA8bTHO2P+HNo1VlUTGMVBwPhydu6poeXiag==",
      "dev": true,
      "license": "MIT"
    }
  },
  "node_modules/tinybench": {
    "before": {
      "version": "2.9.0",
      "resolved": "https://registry.npmjs.org/tinybench/-/tinybench-2.9.0.tgz",
      "integrity": "sha512-0+DUvqWMValLmha6lr4kD8iAMK1HzV0/aKnCtWb9v9641TnP/MFb7Pc2bxoxQjTXAErryXVgUOfv2YqNllqGeg==",
      "dev": true,
      "license": "MIT"
    },
    "after": {
      "version": "6.2.3",
      "resolved": "https://registry.npmjs.org/tinybench/-/tinybench-6.2.3.tgz",
      "integrity": "sha512-Al01C2JIBnO2CXCAPbpAl6sUiOZHeThGtHYNTa51JRw9PyWOCdr+9Ong05R4qg/Sk3+H645E8ov1h2c58ityNw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=20.0.0"
      }
    }
  },
  "node_modules/tinyexec": {
    "before": {
      "version": "1.2.4",
      "resolved": "https://registry.npmjs.org/tinyexec/-/tinyexec-1.2.4.tgz",
      "integrity": "sha512-SHf/r48b7vOrjve9PxJo3MN5v5yuyjHvdUcrQffT3WXMUfnGmHDVbC4k3sHJaJTgZCwpUplIaAo5ANtMyp3YHg==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      }
    },
    "after": {
      "version": "1.3.1",
      "resolved": "https://registry.npmjs.org/tinyexec/-/tinyexec-1.3.1.tgz",
      "integrity": "sha512-GCvB3aoys96IuDFBMcTB46JOR6mdMtAToqwiW8JlWhsoh1mhHi/xn9ss/Dg7N555GiJyEt2qzoG/NHCwM6h1EA==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=18"
      }
    }
  },
  "node_modules/tinyrainbow": {
    "before": {
      "version": "3.1.1",
      "resolved": "https://registry.npmjs.org/tinyrainbow/-/tinyrainbow-3.1.1.tgz",
      "integrity": "sha512-yau8yJdTt989Mm0Bd/236QnzEiPf2xLLTqUZRUJOo/3CB078LSwzei343DgtJVmfJKJE3TMINY1u42SQsP6mXw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=14.0.0"
      }
    },
    "after": null
  },
  "node_modules/type-is/node_modules/content-type": {
    "before": {
      "version": "2.0.0",
      "resolved": "https://registry.npmjs.org/content-type/-/content-type-2.0.0.tgz",
      "integrity": "sha512-j/O/d7GcZCyNl7/hwZAb606rzqkyvaDctLmckbxLzHvFBzTJHuGEdodATcP3yIRoDrLHkIATJuvzbFlp/ki2cQ==",
      "license": "MIT",
      "engines": {
        "node": ">=18"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/express"
      }
    },
    "after": null
  },
  "node_modules/vite": {
    "before": {
      "version": "8.2.4",
      "resolved": "https://registry.npmjs.org/vite/-/vite-8.2.4.tgz",
      "integrity": "sha512-lfauXnrf2x0p+UoA+wXh0dgFWnUjCyG6Js95KBkgaCwUU9k0DAHI4W6Q0WCx+h+5g+Alce1y4Zi2QjjK0UvGBw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "lightningcss": "^1.33.0",
        "picomatch": "^4.0.5",
        "postcss": "^8.5.26",
        "rolldown": "~1.2.4",
        "tinyglobby": "^0.2.17"
      },
      "bin": {
        "vite": "bin/vite.js"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "funding": {
        "url": "https://github.com/vitejs/vite?sponsor=1"
      },
      "optionalDependencies": {
        "fsevents": "~2.3.3"
      },
      "peerDependencies": {
        "@types/node": "^20.19.0 || >=22.12.0",
        "@vitejs/devtools": "^0.4.0 || ^0.5.0",
        "esbuild": "^0.27.0 || ^0.28.0",
        "jiti": ">=1.21.0",
        "less": "^4.0.0",
        "sass": "^1.70.0",
        "sass-embedded": "^1.70.0",
        "stylus": ">=0.54.8",
        "sugarss": "^5.0.0",
        "terser": "^5.16.0",
        "tsx": "^4.8.1",
        "yaml": "^2.4.2"
      },
      "peerDependenciesMeta": {
        "@types/node": {
          "optional": true
        },
        "@vitejs/devtools": {
          "optional": true
        },
        "esbuild": {
          "optional": true
        },
        "jiti": {
          "optional": true
        },
        "less": {
          "optional": true
        },
        "sass": {
          "optional": true
        },
        "sass-embedded": {
          "optional": true
        },
        "stylus": {
          "optional": true
        },
        "sugarss": {
          "optional": true
        },
        "terser": {
          "optional": true
        },
        "tsx": {
          "optional": true
        },
        "yaml": {
          "optional": true
        }
      }
    },
    "after": {
      "version": "8.2.4",
      "resolved": "https://registry.npmjs.org/vite/-/vite-8.2.4.tgz",
      "integrity": "sha512-lfauXnrf2x0p+UoA+wXh0dgFWnUjCyG6Js95KBkgaCwUU9k0DAHI4W6Q0WCx+h+5g+Alce1y4Zi2QjjK0UvGBw==",
      "dev": true,
      "license": "MIT",
      "peer": true,
      "dependencies": {
        "lightningcss": "^1.33.0",
        "picomatch": "^4.0.5",
        "postcss": "^8.5.26",
        "rolldown": "~1.2.4",
        "tinyglobby": "^0.2.17"
      },
      "bin": {
        "vite": "bin/vite.js"
      },
      "engines": {
        "node": "^20.19.0 || >=22.12.0"
      },
      "funding": {
        "url": "https://github.com/vitejs/vite?sponsor=1"
      },
      "optionalDependencies": {
        "fsevents": "~2.3.3"
      },
      "peerDependencies": {
        "@types/node": "^20.19.0 || >=22.12.0",
        "@vitejs/devtools": "^0.4.0 || ^0.5.0",
        "esbuild": "^0.27.0 || ^0.28.0",
        "jiti": ">=1.21.0",
        "less": "^4.0.0",
        "sass": "^1.70.0",
        "sass-embedded": "^1.70.0",
        "stylus": ">=0.54.8",
        "sugarss": "^5.0.0",
        "terser": "^5.16.0",
        "tsx": "^4.8.1",
        "yaml": "^2.4.2"
      },
      "peerDependenciesMeta": {
        "@types/node": {
          "optional": true
        },
        "@vitejs/devtools": {
          "optional": true
        },
        "esbuild": {
          "optional": true
        },
        "jiti": {
          "optional": true
        },
        "less": {
          "optional": true
        },
        "sass": {
          "optional": true
        },
        "sass-embedded": {
          "optional": true
        },
        "stylus": {
          "optional": true
        },
        "sugarss": {
          "optional": true
        },
        "terser": {
          "optional": true
        },
        "tsx": {
          "optional": true
        },
        "yaml": {
          "optional": true
        }
      }
    }
  },
  "node_modules/vitest": {
    "before": {
      "version": "4.1.12",
      "resolved": "https://registry.npmjs.org/vitest/-/vitest-4.1.12.tgz",
      "integrity": "sha512-5eWdz2yb3ajxWF3C8C4TjkXl7FGm3n2E/VlazALrQHzK7nYMSGFnCZto0bbPNl77AwkOZVLk0YnBAejUu0NiWA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@vitest/expect": "4.1.12",
        "@vitest/mocker": "4.1.12",
        "@vitest/pretty-format": "4.1.12",
        "@vitest/runner": "4.1.12",
        "@vitest/snapshot": "4.1.12",
        "@vitest/spy": "4.1.12",
        "@vitest/utils": "4.1.12",
        "es-module-lexer": "^2.0.0",
        "expect-type": "^1.3.0",
        "magic-string": "^0.30.21",
        "obug": "^2.1.1",
        "pathe": "^2.0.3",
        "picomatch": "^4.0.3",
        "std-env": "^4.0.0-rc.1",
        "tinybench": "^2.9.0",
        "tinyexec": "^1.0.2",
        "tinyglobby": "^0.2.15",
        "tinyrainbow": "^3.1.0",
        "vite": "^6.0.0 || ^7.0.0 || ^8.0.0",
        "why-is-node-running": "^2.3.0"
      },
      "bin": {
        "vitest": "vitest.mjs"
      },
      "engines": {
        "node": "^20.0.0 || ^22.0.0 || >=24.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/vitest"
      },
      "peerDependencies": {
        "@edge-runtime/vm": "*",
        "@opentelemetry/api": "^1.9.0",
        "@types/node": "^20.0.0 || ^22.0.0 || >=24.0.0",
        "@vitest/browser-playwright": "4.1.12",
        "@vitest/browser-preview": "4.1.12",
        "@vitest/browser-webdriverio": "^4.1.11",
        "@vitest/coverage-istanbul": "4.1.12",
        "@vitest/coverage-v8": "4.1.12",
        "@vitest/ui": "4.1.12",
        "happy-dom": "*",
        "jsdom": "*",
        "vite": "^6.0.0 || ^7.0.0 || ^8.0.0"
      },
      "peerDependenciesMeta": {
        "@edge-runtime/vm": {
          "optional": true
        },
        "@opentelemetry/api": {
          "optional": true
        },
        "@types/node": {
          "optional": true
        },
        "@vitest/browser-playwright": {
          "optional": true
        },
        "@vitest/browser-preview": {
          "optional": true
        },
        "@vitest/browser-webdriverio": {
          "optional": true
        },
        "@vitest/coverage-istanbul": {
          "optional": true
        },
        "@vitest/coverage-v8": {
          "optional": true
        },
        "@vitest/ui": {
          "optional": true
        },
        "happy-dom": {
          "optional": true
        },
        "jsdom": {
          "optional": true
        },
        "vite": {
          "optional": false
        }
      }
    },
    "after": {
      "version": "5.1.0",
      "resolved": "https://registry.npmjs.org/vitest/-/vitest-5.1.0.tgz",
      "integrity": "sha512-MzmNFnrwa8v8lF1bLxw3UJ4EREwVOVb75VqJZmUDRjJ6EluK/x9th7qTbaeDk41WxE1GxWqmTXcdsfobfH5sOA==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@types/chai": "^5.2.2",
        "@vitest/mocker": "5.1.0",
        "chai": "^6.3.0",
        "es-module-lexer": "^2.3.2",
        "expect-type": "^1.4.0",
        "magic-string": "^1.4.3",
        "obug": "^3.0.0",
        "picomatch": "^4.0.7",
        "std-env": "^4.3.0",
        "tinybench": "^6.2.2",
        "tinyexec": "^1.3.1",
        "tinyglobby": "^0.2.17",
        "why-is-node-running": "3.2.1"
      },
      "bin": {
        "vitest": "vitest.mjs"
      },
      "engines": {
        "node": "^22.12.0 || ^24.0.0 || >=26.0.0"
      },
      "funding": {
        "url": "https://opencollective.com/vitest"
      },
      "peerDependencies": {
        "@edge-runtime/vm": "*",
        "@opentelemetry/api": "^1.9.0",
        "@types/node": "^22.0.0 || >=24.0.0",
        "@vitest/browser-playwright": "5.1.0",
        "@vitest/browser-preview": "5.1.0",
        "@vitest/browser-webdriverio": "^5.0.0-beta.5 || >=5.0.0",
        "@vitest/coverage-istanbul": "5.1.0",
        "@vitest/coverage-v8": "5.1.0",
        "@vitest/ui": "5.1.0",
        "happy-dom": "*",
        "jsdom": "*",
        "vite": "^6.4.0 || ^7.0.0 || ^8.0.0"
      },
      "peerDependenciesMeta": {
        "@edge-runtime/vm": {
          "optional": true
        },
        "@opentelemetry/api": {
          "optional": true
        },
        "@types/node": {
          "optional": true
        },
        "@vitest/browser-playwright": {
          "optional": true
        },
        "@vitest/browser-preview": {
          "optional": true
        },
        "@vitest/browser-webdriverio": {
          "optional": true
        },
        "@vitest/coverage-istanbul": {
          "optional": true
        },
        "@vitest/coverage-v8": {
          "optional": true
        },
        "@vitest/ui": {
          "optional": true
        },
        "happy-dom": {
          "optional": true
        },
        "jsdom": {
          "optional": true
        },
        "vite": {
          "optional": false
        }
      }
    }
  },
  "node_modules/why-is-node-running": {
    "before": {
      "version": "2.3.0",
      "resolved": "https://registry.npmjs.org/why-is-node-running/-/why-is-node-running-2.3.0.tgz",
      "integrity": "sha512-hUrmaWBdVDcxvYqnyh09zunKzROWjbZTiNy8dBEjkS7ehEDQibXJ7XvlmtbwuTclUiIyN+CyXQD4Vmko8fNm8w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "siginfo": "^2.0.0",
        "stackback": "0.0.2"
      },
      "bin": {
        "why-is-node-running": "cli.js"
      },
      "engines": {
        "node": ">=8"
      }
    },
    "after": {
      "version": "3.2.1",
      "resolved": "https://registry.npmjs.org/why-is-node-running/-/why-is-node-running-3.2.1.tgz",
      "integrity": "sha512-Tb2FUhB4vUsGQlfSquQLYkApkuPAFQXGFzxWKHHumVz2dK+X1RUm/HnID4+TfIGYJ1kTcwOaCk/buYCEJr6YjQ==",
      "dev": true,
      "license": "MIT",
      "bin": {
        "why-is-node-running": "cli.js"
      },
      "engines": {
        "node": ">=20.11"
      }
    }
  }
};
