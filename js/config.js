/*! 초록별 퀴즈 마을 — 기관 배포 설정
 *
 * 기본값은 "브라우저 안 무료 AI"입니다. 서버·API 키·비용이 없고, 아이가 쓴 글이 기기 밖으로 나가지 않습니다.
 * 처음 켤 때 한 번 모델을 내려받아(기본 Gemma 4 E2B 약 2.8GB) 브라우저에 저장하고, 다음부터는 저장본을 바로 씁니다.
 * 데이터 요금을 생각해 자동으로 내려받지 않고, 보호자·선생님이 "무료 AI 켜기"를 눌렀을 때만 받습니다.
 *
 * 기관 AI 서버(행정안전부 AI 공통기반, 내부 vLLM·Ollama 등)를 쓰려면 아래처럼 바꾸면 됩니다.
 *   provider: 'openai', baseUrl: 'https://기관-게이트웨이/v1', model: '모델이름'
 * ※ API 키는 이 파일에 적지 마세요. 공개 저장소에 올라가면 누구나 볼 수 있습니다.
 * ※ enabled: false 로 두면 AI 없이 기본 문제은행만으로 동작합니다.
 */
window.GQ_AI_DEFAULT = {
  enabled: true,
  provider: 'webllm',                      // 'webllm'(브라우저 안 무료 AI) | 'openai'(OpenAI 호환) | 'anthropic' | 'claude-artifact'
  baseUrl: '',
  model: 'gemma-4-E2B-it-q4f16_1-MLC',     // 브라우저 AI 모델 (설정 화면에서 바꿀 수 있음, js/llm.js의 WEB_MODELS 참고)
  temperature: 0.4,
  maxTokens: 1200,
  crossCheck: true,                        // AI가 만든 문제를 한 번 더 AI로 교차 검토
  timeoutSec: 45                           // 서버형 기준 대기 시간(브라우저 AI는 자동으로 2.5배)
};
