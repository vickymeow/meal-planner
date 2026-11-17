// 公开配置：可以放进公开仓库。
// Supabase 的 publishable key 本来就是给浏览器用的；真正把关的是「家庭密钥」，
// 它只通过链接 ?h=… 发给家里人，不写在仓库里。
window.MP_CONFIG = {
  supabaseUrl: "https://jnrceiwidetzijmdbczs.supabase.co",
  supabaseKey: "sb_publishable_G-jiIbSoynv1jpCx0thd1w_7CZ-WYWy",
  // 天气：填上家里的经纬度就显示天气（Open-Meteo，免费、不用 key）。留空就不显示天气那一行。
  weather: { latitude: 37.5841, longitude: -122.3661 }, // Burlingame, CA
  // 多久同步一次（毫秒）。打开 App、切回来时也会立刻同步。
  pollMs: 8000,
  // 自动配图（Pollinations）先关掉：免费额度用完时它会返回一张写着「限制次数」的图。没有照片的菜显示暖色方块。
  // 家里人可以在每道菜的做法页点「换照片」换成自己拍的。
  autoPhotos: false
};
