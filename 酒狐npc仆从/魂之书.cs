using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>魂之书——酒狐受击时：伤害大于最大生命60%→只承60%并立刻回30%；大于30%→立刻回20%再承伤；否则直降20%再承伤。另提高酒狐100%无敌帧。</summary>
public sealed class 魂之书 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/soul_book_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.LightPurple;
        Item.value = Item.buyPrice(gold: 8);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.ShroomiteBar, 10)   //蘑菇矿锭x10
            .AddIngredient(ItemID.Ectoplasm, 5)       //灵质x5
            .AddIngredient(ItemID.SpellTome, 1)       //魔法书x1
            .AddIngredient(ModContent.ItemType<不死图腾>(), 1)  //不死图腾x1
            .AddTile(TileID.WorkBenches)                 //在工作台下；并需处于墓地环境
            .AddCondition(Condition.InGraveyard)
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(150, 120, 255);
                break;
            }
        }
    }
}
