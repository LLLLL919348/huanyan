using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using ReLogic.Content;
using Terraria;
using Terraria.GameContent;
using Terraria.GameContent.UI.Elements;
using Terraria.ID;
using Terraria.ModLoader;
using Terraria.UI;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐饰品图鉴界面：一张可滚动的“说明书”。
/// 内容全部来自 <see cref="酒狐饰品图鉴数据"/>，你改数据文件即可，这里不用动。
/// </summary>
public sealed class 酒狐图鉴UI : UIState
{
    private UIList list;
    private UIScrollbar scrollbar;

    public static void Open() => 酒狐互动系统.图鉴Interface.SetState(酒狐互动系统.图鉴State);

    public override void OnInitialize() => Rebuild();

    public override void Update(GameTime gameTime)
    {
        Main.LocalPlayer.mouseInterface = true;
        base.Update(gameTime);
    }

    private void Rebuild()
    {
        RemoveAllChildren();

        //主面板（可拖动）
        UIPanel panel = new 可拖动面板
        {
            BackgroundColor = new Color(24, 28, 44, 235),
            BorderColor = new Color(120, 140, 200, 120)
        };
        panel.Left.Set(Main.screenWidth / 2f - 330f, 0f);
        panel.Top.Set(Main.screenHeight / 2f - 280f, 0f);
        panel.Width.Set(660f, 0f);
        panel.Height.Set(560f, 0f);
        panel.SetPadding(0f);
        Append(panel);

        UIText title = new("酒狐饰品图鉴", 1.15f) { TextColor = new Color(150, 220, 255), HAlign = 0.5f };
        title.Top.Set(16f, 0f);
        panel.Append(title);

        UIText close = new("X") { TextColor = new Color(255, 120, 120) };
        close.Left.Set(618f, 0f);
        close.Top.Set(8f, 0f);
        close.Width.Set(28f, 0f);
        close.Height.Set(30f, 0f);
        close.OnLeftClick += CloseAll;
        panel.Append(close);

        UIText hint = new("（鼠标滚轮滚动）", 0.7f)
        {
            TextColor = new Color(110, 120, 150),
            HAlign = 0.5f
        };
        hint.Top.Set(44f, 0f);
        panel.Append(hint);

        //滚动列表
        list = new UIList();
        list.Left.Set(20f, 0f);
        list.Top.Set(66f, 0f);
        list.Width.Set(596f, 0f);
        list.Height.Set(470f, 0f);
        list.ListPadding = 6f;
        panel.Append(list);

        scrollbar = new UIScrollbar();
        scrollbar.Left.Set(632f, 0f);
        scrollbar.Top.Set(66f, 0f);
        scrollbar.Width.Set(14f, 0f);
        scrollbar.Height.Set(470f, 0f);
        scrollbar.SetView(0f, 1000f);
        list.SetScrollbar(scrollbar);
        panel.Append(scrollbar);

        //填充内容
        foreach (var e in 酒狐饰品图鉴数据.合成饰品)
            list.Add(创建行(e.名称, e.效果, e.获取方式, true, e.图标物品ID, e.颜色));

        list.Add(创建分隔("— 掉落 / 宝箱 / 钓鱼 —"));

        foreach (var e in 酒狐饰品图鉴数据.获取饰品)
            list.Add(创建行(e.名称, e.效果, e.获取方式, false, e.图标物品ID, e.颜色));
    }

    private UIElement 创建行(string 名称, string 效果, string 获取, bool 合成, int itemType, Color color)
    {
        UIPanel row = new()
        {
            BackgroundColor = new Color(38, 44, 66, 150),
            BorderColor = new Color(90, 110, 160, 60)
        };
        row.Width.Set(590f, 0f);
        row.Height.Set(132f, 0f);
        row.SetPadding(0f);

        //衣物图标
        row.Append(new 物品图标UI(itemType) { Left = { Pixels = 10f }, Top = { Pixels = 46f } });

        UIText name = new(名称) { TextColor = color };
        name.Left.Set(58f, 0f);
        name.Top.Set(10f, 0f);
        row.Append(name);

        //合成 / 获取 标签
        UIText tag = new(合成 ? "合成" : "获取") { TextColor = 合成 ? new Color(120, 220, 130) : new Color(255, 180, 120) };
        tag.Left.Set(508f, 0f);
        tag.Top.Set(10f, 0f);
        row.Append(tag);

        //效果文字（可两行，独立一区不重叠）
        UIText eff = new(效果) { TextColor = new Color(200, 210, 230) };
        eff.Left.Set(58f, 0f);
        eff.Top.Set(34f, 0f);
        eff.Width.Set(480f, 0f);
        eff.Height.Set(44f, 0f);
        eff.IsWrapped = true;
        row.Append(eff);

        //获取方式（独立一行，与效果区隔开）
        UIText get = new(获取) { TextColor = new Color(170, 170, 190) };
        get.Left.Set(58f, 0f);
        get.Top.Set(86f, 0f);
        get.Width.Set(480f, 0f);
        get.Height.Set(36f, 0f);
        get.IsWrapped = true;
        row.Append(get);

        return row;
    }

    private static UIElement 创建分隔(string text)
    {
        UIText t = new(text) { TextColor = new Color(120, 180, 255), HAlign = 0.5f };
        t.Width.Set(590f, 0f);
        t.Top.Set(10f, 0f);
        return t;
    }

    private void CloseAll(UIMouseEvent evt, UIElement element)
        => 酒狐互动系统.图鉴Interface.SetState(null);
}

/// <summary>绘制一个物品图标的 UI 元素（取第一帧）。</summary>
internal sealed class 物品图标UI : UIElement
{
    private readonly int itemType;
    private Asset<Texture2D> asset;

    public 物品图标UI(int itemType_) => itemType = itemType_;

    public override void OnInitialize()
    {
        Width.Set(32f, 0f);
        Height.Set(32f, 0f);
        if (itemType > 0)
            asset = TextureAssets.Item[itemType];
    }

    protected override void DrawSelf(SpriteBatch sb)
    {
        if (asset == null || !asset.IsLoaded) return;
        Texture2D tex = asset.Value;
        if (tex == null) return;
        Rectangle src = new(0, 0, tex.Width, tex.Height);
        if (Main.itemAnimations[itemType] != null && Main.itemAnimations[itemType].FrameCount > 1)
            src = new Rectangle(0, 0, tex.Width, tex.Height / Main.itemAnimations[itemType].FrameCount);
        sb.Draw(tex, GetDimensions().ToRectangle(), src, Color.White);
    }
}
