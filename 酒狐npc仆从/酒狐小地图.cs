using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using ReLogic.Content;
using Terraria;
using Terraria.DataStructures;
using Terraria.Map;
using Terraria.ModLoader;
using Terraria.UI;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐的地图标记：右上角【小地图】+ 按M的【全屏大地图】都会显示酒狐的头像。
///
/// ★ 这里用的是 tModLoader 官方接口 ModMapLayer，不再自己算坐标。
///   原因：原版 Main.DrawMap 里有三处 Main.MapIcons.Draw(...)（分别对应“地图覆盖 / 小地图 /
///   全屏大地图”），而 MapIcons 正是由所有 ModMapLayer 组装而成 —— 也就是说实现 ModMapLayer
///   后，三种地图模式都会自动调用，坐标换算、缩放、裁剪全由 MapOverlayDrawContext 负责。
///
///   （踩过的坑：按M打开全屏地图时 Main.DoDraw 会直接跳过 DrawInterface，
///     所以挂在 ModifyInterfaceLayers 上的图层在按M的地图里根本不会被绘制；
///     而 Main.OnPostFullscreenMapDraw 的坐标换算又要自己去猜，容易错位。）
///
///   ★ 坐标单位是【格子】(tile)，不是世界像素 —— 和原版 SpawnMapLayer 传
///     Main.spawnTileX/spawnTileY 一样，所以要传 npc.Center / 16f。
/// </summary>
public sealed class 酒狐地图标记 : ModMapLayer
{
    private static Asset<Texture2D> HeadTex;
    private static Asset<Texture2D> HeadTex2;   //★ 新皮肤的头像

    //头像在地图上的大小（相对贴图原始尺寸40px的缩放）
    //★ 已按需求放大一倍：0.55→1.10（≈44px）、0.70→1.40（≈56px）
    private const float 头像缩放 = 1.10f;   //≈44px
    private const float 悬停缩放 = 1.40f;   //≈56px

    public override void Load()
    {
        HeadTex = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/酒狐头");
        try { HeadTex2 = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/新皮肤/酒狐头"); }
        catch { HeadTex2 = null; }
    }

    public override void Unload()
    {
        HeadTex = null;
        HeadTex2 = null;
    }

    public override void Draw(ref MapOverlayDrawContext context, ref string text)
    {
        if (Main.dedServ) return;
        //★ 按皮肤配置选用头像（新皮肤贴图缺失时回退原头像）
        Texture2D head = (酒狐任务配置.取新皮肤() && HeadTex2?.Value != null) ? HeadTex2.Value : HeadTex?.Value;
        if (head == null) return;

        for (int i = 0; i < Main.maxNPCs; i++)
        {
            NPC n = Main.npc[i];
            if (n == null || !n.active || n.type != ModContent.NPCType<酒狐>()) continue;

            //★ 头像朝向跟随酒狐实际朝向：spriteDirection 才是真正渲染用的方向（direction 可能滞后）
            int 朝向 = n.spriteDirection != 0 ? n.spriteDirection : n.direction;
            SpriteEffects 翻转 = 朝向 < 0 ? SpriteEffects.FlipHorizontally : SpriteEffects.None;

            MapOverlayDrawContext.DrawResult r = context.Draw(
                head,
                n.Center / 16f,          //格坐标
                Color.White,
                new SpriteFrame(1, 1),
                头像缩放,
                悬停缩放,
                Alignment.Center,
                翻转);

            if (r.IsMouseOver) text = "酒狐";
        }
    }
}
