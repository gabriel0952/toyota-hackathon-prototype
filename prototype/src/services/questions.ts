import type { DiagnosticQuestion } from '../domain/contracts'
export const questions: DiagnosticQuestion[] = [
  { id: 'vehicle', title: '你現在開的是哪一類車？', hint: '我們會用目前用車來估算能源開銷與換車差異', kind: 'vehicle' },
  { id: 'locations', title: '你最可能在哪裡充電？', hint: '選一個最接近的情況，不確定也可以繼續。', kind: 'locations' },
  { id: 'distance', title: '你的日常，大約需要開多遠？', hint: '只要填通勤距離，再選長途頻率。', kind: 'slider' },
  { id: 'charging', title: '目前的能源花費大約是多少？', hint: '先填每月油資與里程，再選想比較的車；展開進階條件可讓五年成本試算更準。', kind: 'cards', options: ['每月 NT$ 3,000 以下', '每月 NT$ 3,000–5,000', '每月 NT$ 5,000 以上'] },
]
