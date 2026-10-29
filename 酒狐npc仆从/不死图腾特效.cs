using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using ReLogic.Content;
using Terraria;
using Terraria.GameContent;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>不死图腾复活特效：在角色身上循环播放图腾动画，缓缓上浮后消失。</summary>
public sealed class 不死图腾特效 : ModProjectile
{
    private const int FrameCount = 60;
    private const int TicksPerFrame = 4;
    private static Asset<Texture2D> sheet;

    //必须给一个存在的贴图，否则tML加载时找不到资源
    public override string Texture => "酒狐npc仆从/饰品/totem_anim";

    public override void SetDefaults()
    {
        Projectile.width = 40;
        Projectile.height = 40;
        Projectile.friendly = true;
        Projectile.hostile = false;
        Projectile.tileCollide = false;
        Projectile.ignoreWater = true;
        Projectile.penetrate = -1;
        Projectile.timeLeft = 240;
        Projectile.scale = 1f;
        Projectile.aiStyle = -1;
    }

    public override void AI()
    {
        // 缓缓上浮、轻微横向摆动
        Projectile.velocity.Y -= 0.02f;
        Projectile.velocity.X *= 0.95f;
    }

    public override bool PreDraw(ref Color lightColor)
    {
        if (sheet == null) sheet = ModContent.Request<Texture2D>("酒狐npc仆从/饰品/totem_anim");
        if (sheet == null) return false;
        int frame = (int)(Projectile.ai[0] / TicksPerFrame) % FrameCount;
        Projectile.ai[0]++;
        Rectangle src = new Rectangle(0, frame * Projectile.height, Projectile.width, Projectile.height);
        Vector2 pos = Projectile.Center - Main.screenPosition;
        //放大2倍绘制，让图腾动画清晰可见
        Main.spriteBatch.Draw(sheet.Value, pos, src, Color.White, 0f, new Vector2(Projectile.width / 2f, Projectile.height / 2f), 2f, SpriteEffects.None, 0f);
        return false;
    }
}
