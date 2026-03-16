const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./market.db');

console.log('===== 闲置集市数据库 =====\n');

// 查看所有表
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) { console.error('错误:', err); return; }
  console.log('📋 数据表:', tables.map(t => t.name).join(', '));
  console.log();

  // 查看用户表
  db.all('SELECT * FROM users', (err, users) => {
    console.log('👤 用户表 (users):');
    console.log('总计:', users.length, '条记录');
    if (users.length > 0) {
      console.table(users.map(u => ({
        ID: u.id,
        用户名: u.username,
        手机号: u.phone || '-',
        简介: u.bio ? u.bio.substring(0, 20) + '...' : '-',
        注册时间: u.created_at
      })));
    } else {
      console.log('(暂无用户)\n');
    }

    // 查看商品表
    db.all('SELECT p.*, u.username as seller FROM products p JOIN users u ON p.user_id = u.id', (err, products) => {
      console.log('\n📦 商品表 (products):');
      console.log('总计:', products.length, '条记录');
      if (products.length > 0) {
        console.table(products.map(p => ({
          ID: p.id,
          标题: p.title.substring(0, 25) + (p.title.length > 25 ? '...' : ''),
          价格: '¥' + p.price,
          分类: p.category,
          成色: p.condition,
          状态: p.status,
          浏览: p.views,
          卖家: p.seller,
          发布时间: p.created_at
        })));
      } else {
        console.log('(暂无商品)\n');
      }

      // 查看收藏表
      db.all('SELECT f.*, u.username, p.title FROM favorites f JOIN users u ON f.user_id = u.id JOIN products p ON f.product_id = p.id', (err, favs) => {
        console.log('\n❤️ 收藏表 (favorites):');
        console.log('总计:', favs.length, '条记录');
        if (favs.length > 0) {
          console.table(favs.map(f => ({
            ID: f.id,
            用户: f.username,
            商品: f.title.substring(0, 20) + '...',
            收藏时间: f.created_at
          })));
        } else {
          console.log('(暂无收藏)\n');
        }

        // 查看消息表
        db.all('SELECT m.*, u1.username as sender, u2.username as receiver, p.title FROM messages m JOIN users u1 ON m.sender_id = u1.id JOIN users u2 ON m.receiver_id = u2.id JOIN products p ON m.product_id = p.id', (err, msgs) => {
          console.log('\n💬 消息表 (messages):');
          console.log('总计:', msgs.length, '条记录');
          if (msgs.length > 0) {
            console.table(msgs.map(m => ({
              ID: m.id,
              商品: m.title.substring(0, 15) + '...',
              发送者: m.sender,
              接收者: m.receiver,
              内容: m.content.substring(0, 30) + (m.content.length > 30 ? '...' : ''),
              已读: m.is_read ? '✓' : '✗',
              时间: m.created_at
            })));
          } else {
            console.log('(暂无消息)\n');
          }

          console.log('\n===== 数据库查看完成 =====');
          db.close();
        });
      });
    });
  });
});
