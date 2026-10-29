using System.Collections.Generic;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐饰品图鉴（说明书）：左键使用，打开“饰品获取图鉴”界面，
/// 查看所有酒狐饰品的合成配方与获取方式。
/// 首次进入世界赠送，不会消耗。
/// </summary>
public sealed class 酒狐图鉴 : ModItem
{
    public override string Texture => "酒狐npc仆从/Content/Images/JiuHuGuide";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.maxStack = 1;
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.HoldUp;
        Item.rare = ItemRarityID.Cyan;
        Item.value = Item.buyPrice(gold: 1);
        Item.UseSound = SoundID.Item44;
        Item.ResearchUnlockCount = 1;
    }

    public override bool CanUseItem(Player player) => true;

    public override bool? UseItem(Player player)
    {
        酒狐图鉴UI.Open();
        return true;
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Microsoft.Xna.Framework.Color(150, 220, 255);
                line.Text = "酒狐饰品图鉴";
                break;
            }
        }
        tooltips.Add(new TooltipLine(Mod, "GuideTip", "左键使用：打开饰品获取图鉴"));
        tooltips.Add(new TooltipLine(Mod, "GuideTip2", "首次进入世界赠送"));
    }
}
