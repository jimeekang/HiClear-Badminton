import assert from "node:assert/strict";
import test from "node:test";
import { getCourtVoiceSettings, selectNaturalKoreanVoice } from "../lib/courtVoiceSettings.ts";

const voice = (name: string, lang: string, localService = true) => ({
  name,
  lang,
  localService,
});

test("selects a natural Korean voice when the browser provides one", () => {
  const selected = selectNaturalKoreanVoice([
    voice("Google US English", "en-US", false),
    voice("Microsoft Heami - Korean", "ko-KR", true),
    voice("Microsoft SunHi Online (Natural) - Korean", "ko-KR", false),
  ]);

  assert.equal(selected?.name, "Microsoft SunHi Online (Natural) - Korean");
});

test("does not select a non-Korean voice", () => {
  const selected = selectNaturalKoreanVoice([
    voice("Google US English", "en-US", false),
    voice("Microsoft Aria Online (Natural) - English", "en-US", false),
  ]);

  assert.equal(selected, null);
});

test("uses slower court announcement speech settings", () => {
  const settings = getCourtVoiceSettings([
    voice("Microsoft SunHi Online (Natural) - Korean", "ko-KR", false),
  ]);

  assert.equal(settings.lang, "ko-KR");
  assert.equal(settings.voice?.name, "Microsoft SunHi Online (Natural) - Korean");
  assert.ok(settings.rate < 0.85);
  assert.equal(settings.pitch, 1);
  assert.equal(settings.volume, 1);
});
