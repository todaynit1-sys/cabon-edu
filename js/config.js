/*! 초록별 퀴즈 마을 — 기관 배포 설정
 *
 * 기관(학교·교육청·환경교육센터)에서 배포할 때 AI 모델 연결 기본값을 여기에 적어 두면,
 * 아이들은 설정 화면을 열지 않고도 바로 AI 기능을 씁니다. (설정 화면에서 바꾼 값이 있으면 그 값이 우선)
 *
 * ※ API 키는 이 파일에 적지 마세요. 공개 저장소에 올라가면 누구나 볼 수 있습니다.
 *    키가 필요한 모델은 기관 게이트웨이(키를 서버에서 붙여 주는 프록시)를 두는 방식을 권장합니다.
 * ※ enabled: false 로 두면 AI 없이 기본 문제은행만으로 동작합니다.
 */
window.GQ_AI_DEFAULT = {
  enabled: true,
  provider: 'openai',                      // 'openai'(OpenAI 호환) | 'anthropic' | 'claude-artifact'
  baseUrl: 'http://localhost:11434/v1',    // 예: Ollama 로컬
  model: 'gemma3:12b',
  temperature: 0.4,
  maxTokens: 1600,
  crossCheck: true,                        // AI가 만든 문제를 한 번 더 AI로 교차 검토
  timeoutSec: 45                           // 이 시간 안에 문제가 안 오면 기본 문제로 진행
};
