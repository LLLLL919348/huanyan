using System;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.GameContent;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐投掷出去的近战武器：武器槽里所有【非主手】的近战武器都可能被扔向目标。
///
///  · 伤害：创建时已按面板算好（单发模式额外 ×1.5；法术超限再 ×1.2）
///  · 贴图：直接用该武器自身的物品贴图（ai[2] 存物品type），高速旋转飞出，贴图放大绘制
///  · 判定箱：按武器贴图大小设定（贴图越大判定箱越大）
///  · 两种飞行模式：
///      模式0 单发：从酒狐位置直直飞向目标，体积更大、伤害×1.5、速度更快
///      模式1 双发：从酒狐两侧旋转甩出，先外扩再收拢（近似椭圆弧）飞向目标，体积较小、速度稍慢
///  · 寿命：会一直沿轨道飞行，直到【命中】/【超出屏幕一定距离】/【存活时间到】才消失
///
/// 数据存放：ai[0]=目标NPC索引  ai[1]=模式(0单发 / 1双发左 / 2双发右)  ai[2]=物品type
/// （ai 会自动同步；localAI[0] 只作“已初始化判定箱”的本地标记，两边算出来一样）
/// </summary>
public sealed class 投掷近战弹 : ModProjectile
{
    //PreDraw 里自己按“武器物品贴图”绘制，这里的 Texture 只是给加载器一个确实存在的资源
    public override string Texture => "酒狐npc仆从/饰品/totem_anim";

    private const float 单发速度 = 17f;
    private const float 双发速度 = 11f;
    private const int 最大存活 = 480;          //★ 存活更久（约8秒）
    private const float 出屏判距 = 1500f;      //★ 离玩家这么远（或出屏）才消失
    private const float 绘制放大 = 64f;        //★ 贴图绘制更大（按贴图最长边归一化到这个像素）

    public override void SetStaticDefaults()
    {
        ProjectileID.Sets.TrailCacheLength[Type] = 8;
        ProjectileID.Sets.TrailingMode[Type] = 2;
    }

    public override void SetDefaults()
    {
        Projectile.width = 24;
        Projectile.height = 24;
        Projectile.friendly = true;
        Projectile.hostile = false;
        Projectile.tileCollide = false;
        Projectile.ignoreWater = true;
        Projectile.penetrate = 1;
        Projectile.timeLeft = 最大存活;
        Projectile.DamageType = DamageClass.Melee;
        Projectile.usesLocalNPCImmunity = true;
        Projectile.localNPCHitCooldown = 12;
        Projectile.aiStyle = -1;
    }

    //★ 首次运行：按武器贴图大小设置判定箱（贴图越大判定箱越大）
    private void 初始化判定箱()
    {
        if (Projectile.localAI[0] > 0f) return;
        Projectile.localAI[0] = 1f;
        int itemType = (int)Projectile.ai[2];
        if (itemType <= 0 || itemType >= TextureAssets.Item.Length) return;
        Texture2D tex = TextureAssets.Item[itemType].Value;
        if (tex == null || tex.Width <= 0) return;
        float 尺寸 = Math.Max(tex.Width, tex.Height) * 0.62f * Projectile.scale;
        int 边长 = (int)MathHelper.Clamp(尺寸, 18f, 96f);
        Projectile.position = Projectile.Center - new Vector2(边长 / 2f);
        Projectile.width = 边长;
        Projectile.height = 边长;
    }

    private NPC 当前目标()
    {
        int idx = (int)Projectile.ai[0];
        if (idx < 0 || idx >= Main.maxNPCs) return null;
        NPC n = Main.npc[idx];
        return (n != null && n.active && n.life > 0 && !n.dontTakeDamage) ? n : null;
    }

    public override void AI()
    {
        bool 双发 = Projectile.ai[1] >= 0.5f;
        int 存活 = 最大存活 - Projectile.timeLeft;
        float 速度 = 双发 ? 双发速度 : 单发速度;
        Projectile.scale = 双发 ? 1.05f : 1.55f;      //单发体积更大
        Projectile.rotation += 双发 ? 0.38f : 0.55f;  //高速旋转
        初始化判定箱();

        NPC t = 当前目标();
        if (t != null)
        {
            Vector2 toT = t.Center - Projectile.Center;
            if (toT != Vector2.Zero)
            {
                toT.Normalize();
                if (双发)
                {
                    //近似椭圆：先在侧向外甩，随时间收拢回目标方向
                    Vector2 perp = new(-toT.Y, toT.X);
                    float 侧 = Projectile.ai[1] > 1.5f ? -1f : 1f;
                    float 外甩 = MathHelper.Clamp(1f - 存活 / 34f, 0f, 1f) * 速度 * 1.05f;
                    Vector2 期望 = toT * 速度 + perp * (外甩 * 侧);
                    if (期望 != Vector2.Zero)
                    {
                        期望.Normalize();
                        期望 *= 速度;
                    }
                    Projectile.velocity = Vector2.Lerp(Projectile.velocity, 期望, 0.16f);
                }
                else
                {
                    //直飞：只做很轻的修正，保证移动中的目标也能命中
                    Vector2 期望 = toT * 速度;
                    Projectile.velocity = Vector2.Lerp(Projectile.velocity, 期望, 0.045f);
                }
            }
            //★ 不再“接近目标就消失”：命中的判定交给弹幕碰撞（OnHitNPC 后 penetrate=1 自然消失），
            //  没打中也让它继续沿轨道飞，直到出屏或时间到。
        }
        //目标消失 → 保持当前速度沿轨道继续飞（不再立刻销毁）

        //★ 超出屏幕一定距离 / 离玩家太远 → 消失
        Player owner = Projectile.owner >= 0 && Projectile.owner < Main.maxPlayers ? Main.player[Projectile.owner] : null;
        if (owner != null && owner.active
            && Vector2.Distance(Projectile.Center, owner.Center) > 出屏判距)
        {
            爆散();
            Projectile.Kill();
            return;
        }

        if (!Main.dedServ && 存活 % 2 == 0)
        {
            Dust d = Dust.NewDustPerfect(Projectile.Center, DustID.Silver, -Projectile.velocity * 0.08f, 0, new Color(200, 220, 255), 1.0f);
            d.noGravity = true;
        }
    }

    private void 爆散()
    {
        if (Main.dedServ) return;
        for (int i = 0; i < 8; i++)
        {
            Dust d = Dust.NewDustPerfect(Projectile.Center, DustID.Silver, Main.rand.NextVector2Circular(4f, 4f), 0, new Color(220, 235, 255), 1.2f);
            d.noGravity = true;
        }
    }

    public override void OnHitNPC(NPC target, NPC.HitInfo hit, int damageDone) => 爆散();

    public override void OnKill(int timeLeft) => 爆散();

    public override bool PreDraw(ref Color lightColor)
    {
        int itemType = (int)Projectile.ai[2];
        if (itemType <= 0 || itemType >= TextureAssets.Item.Length) return false;
        Texture2D tex = TextureAssets.Item[itemType].Value;
        if (tex == null || tex.Width <= 0 || tex.Height <= 0) return false;

        Vector2 origin = tex.Size() / 2f;
        //★ 按贴图最长边归一化到 绘制放大 像素（比之前大不少），单发模式更大
        float 缩放 = Projectile.scale * 绘制放大 / Math.Max(tex.Width, tex.Height);

        for (int i = 1; i <= 5; i++)
        {
            if (i >= Projectile.oldPos.Length) break;
            Vector2 旧 = Projectile.oldPos[i];
            if (旧 == Vector2.Zero) continue;
            Vector2 位置 = 旧 + Projectile.Size / 2f - Main.screenPosition;
            float 旧旋转 = i < Projectile.oldRot.Length ? Projectile.oldRot[i] : Projectile.rotation;
            Main.spriteBatch.Draw(tex, 位置, null, new Color(180, 210, 255) * (0.20f / i), 旧旋转, origin, 缩放, SpriteEffects.None, 0f);
        }

        Main.spriteBatch.Draw(tex, Projectile.Center - Main.screenPosition, null, lightColor, Projectile.rotation, origin, 缩放, SpriteEffects.None, 0f);
        return false;
    }
}
