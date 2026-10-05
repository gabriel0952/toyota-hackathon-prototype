import { Button } from './ui'

export function IdentityConflictNotice({ onSwitch, busy }: { onSwitch: () => void; busy: boolean }) {
  return <div className="identity-conflict" role="alert">
    <b>這個瀏覽器目前登入的是展示顧問</b>
    <p>顧問身分不能填寫車主問卷。切換後會登出顧問；要同時看顧問後台，請改用另一個瀏覽器或無痕視窗登入。</p>
    <Button disabled={busy} onClick={onSwitch}>{busy ? '切換中…' : '切換成車主身分，繼續填寫'}</Button>
  </div>
}
