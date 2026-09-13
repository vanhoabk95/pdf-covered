# Test fonts

Noto Sans (SIL Open Font License 1.1, see `OFL.txt`), subset to Latin + Vietnamese for small fixtures:

```sh
pyftsubset NotoSans-Regular.ttf --layout-features="kern" --no-hinting --desubroutinize \
  --unicodes="U+0020-007E,U+00A0-00FF,U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0303,U+0309,U+0323,U+1EA0-1EF9,U+2013-2014,U+2018-201D,U+2022,U+2026,U+20AB" \
  --output-file=NotoSansVi-Regular.ttf
```

Same for Bold. Used only by `tests/helpers/fixtures.ts`.
