using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.DataStructures;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>不死图腾—死亡时立即恢复30%最大生命，免疫致命伤害，给予正面buff</summary>
public sealed class 不死图腾 : ModItem
{
    //物品图标用清晰的静态图腾；动画在复活时由 不死图腾特效 播放
    public override string Texture => "酒狐npc仆从/饰品/Totem_of_Undying_JE2_BE2";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.LightRed;
        Item.value = Item.buyPrice(gold: 8);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(255, 190, 70);
                break;
            }
        }
    }
}
