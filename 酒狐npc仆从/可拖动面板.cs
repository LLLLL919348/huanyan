using Microsoft.Xna.Framework;
using Terraria;
using Terraria.GameContent.UI.Elements;
using Terraria.UI;

namespace 酒狐npc仆从;

/// <summary>
/// 可拖动的面板：按住标题栏（顶部 44px）即可拖动，且限制在屏幕范围内。
/// 用于 酒狐互动UI 与 酒狐图鉴UI。
/// </summary>
public class 可拖动面板 : UIPanel
{
    private bool dragging;
    private Vector2 dragOffset;
    private readonly float titleBarHeight;

    public 可拖动面板(float titleBarHeight = 44f)
    {
        this.titleBarHeight = titleBarHeight;
    }

    // 屏幕内拖动（避免拖出窗外）
    public override void LeftMouseDown(UIMouseEvent evt)
    {
        base.LeftMouseDown(evt);
        CalculatedStyle dims = GetDimensions();
        bool inTitleBar = Main.MouseScreen.Y <= dims.Y + titleBarHeight;
        //关闭按钮区域(右上角)留给点击，不要误拖
        bool overCloseArea = Main.MouseScreen.X >= dims.X + dims.Width - 60f && Main.MouseScreen.Y <= dims.Y + 40f;
        if (!inTitleBar || overCloseArea)
            return;
        dragging = true;
        dragOffset = Main.MouseScreen - new Vector2(dims.X, dims.Y);
    }

    public override void LeftMouseUp(UIMouseEvent evt)
    {
        base.LeftMouseUp(evt);
        dragging = false;
    }

    public override void Update(GameTime gameTime)
    {
        base.Update(gameTime);
        if (!dragging)
            return;

        Vector2 desired = Main.MouseScreen - dragOffset;
        float maxX = MathHelper.Max(0f, Main.screenWidth - GetDimensions().Width);
        float maxY = MathHelper.Max(0f, Main.screenHeight - GetDimensions().Height);
        desired.X = MathHelper.Clamp(desired.X, 0f, maxX);
        desired.Y = MathHelper.Clamp(desired.Y, 0f, maxY);

        HAlign = 0f;
        VAlign = 0f;
        Left.Set(desired.X, 0f);
        Top.Set(desired.Y, 0f);
        Recalculate();
    }
}
