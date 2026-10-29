using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;
using Terraria.ModLoader.IO;

namespace 酒狐npc仆从;

/// <summary>绀珠之药——仅酒狐可佩戴，相当于不死图腾，共8次。</summary>
public sealed class 绀珠之药 : ModItem
{
    public const int MaxUses = 8;
    // 内部剩余次数（不占用stack）
    public int 剩余次数 = MaxUses;

    public override string Texture => "酒狐npc仆从/饰品/ultramarine_orb_elixir_big";

    public override void SetStaticDefaults()
    {
        //微光湖：转成无限版（原版固定转换无法做10%概率，此处简化为必转）
        ItemID.Sets.ShimmerTransformToItem[Item.type] = ModContent.ItemType<绀珠之药无限>();
    }

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;   //堆叠回到1，次数内部计算
        Item.rare = ItemRarityID.Cyan;
        Item.value = Item.buyPrice(gold: 5);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ModContent.ItemType<不死图腾>(), 6)
            .AddTile(TileID.WorkBenches)
            .Register();
    }

    public override void SaveData(TagCompound tag)
    {
        tag["剩余次数"] = 剩余次数;
    }

    public override void LoadData(TagCompound tag)
    {
        剩余次数 = tag.ContainsKey("剩余次数") ? tag.GetInt("剩余次数") : MaxUses;
    }

    // 读取该物品实例的剩余次数
    internal static int 获取次数(Item item)
    {
        return item?.ModItem is 绀珠之药 orb ? orb.剩余次数 : MaxUses;
    }

    // 使用一次：扣次数；用尽销毁；返回false=已用尽销毁
    internal static bool 消耗一次(Item item)
    {
        if (item?.ModItem is 绀珠之药 orb)
        {
            orb.剩余次数--;
            if (orb.剩余次数 <= 0)
            {
                item.TurnToAir();
                return false;
            }
            return true;
        }
        return true;
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(90, 190, 255);
                break;
            }
        }
    }
}
