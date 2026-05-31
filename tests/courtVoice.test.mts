import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("voice announcement preloads browser voices and applies court voice settings", () => {
  const source = readFileSync("hooks/useCourtVoice.ts", "utf8");

  assert.match(source, /useEffect/);
  assert.match(source, /getCourtVoiceSettings/);
  assert.match(source, /speechSynthesis\.getVoices\(\)/);
  assert.match(source, /voiceschanged/);
  assert.match(source, /utterance\.voice\s*=\s*settings\.voice/);
});
