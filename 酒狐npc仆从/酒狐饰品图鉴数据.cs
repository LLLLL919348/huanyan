using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐饰品图鉴：<b>唯一的可修改数据源</b>。
/// 你想改任何一条饰品的信息（名称/效果/获取方式），直接在这里改对应字段即可，
/// 界面会自动跟着变，不需要动 UI 代码。
///
/// 每个词条的字段说明：
///   名称, 效果      —— 显示的文本
///   获取方式        —— 合成配方 / 掉落 / 宝箱 / 钓鱼 等，写你想要的文案
///   是否合成        —— true = 有合成配方（显示“合成”标签），false = 仅获取
///   图标物品ID      —— 在界面里显示该饰品的小图标（用对应饰品的 ModContent.ItemType）
///   颜色            —— 名称字体颜色
/// </summary>
public static class 酒狐饰品图鉴数据
{
    //================ A. 有合成配方的 =================
    public static readonly 图鉴词条[] 合成饰品 =
    {
        new("双心之链*", "玩家与酒狐各承担一半任意一方所受的伤害",
            "生命水晶x2 + 铂金锭x5 + 金锭x2（工匠作坊）", true,
            双心之链(), new Color(255, 130, 160)),

        new("混沌之书", "攻击后片刻再额外造成该攻击5%的伤害",
            "剑刃法杖x1 + 不和谐之钩x1 + 光明碎片x20 + 暗影碎片x20（恶魔祭坛）", true,
            混沌之书(), new Color(150, 120, 255)),

        new("魂之书*", "酒狐受击大额伤害时削减并回复，提高无敌帧",
            "蘑菇矿锭x10 + 灵质x5 + 魔法书x1 + 不死图腾x1（工作台·墓地环境）", true,
            魂之书(), new Color(200, 170, 255)),

        new("芳心织囊", "玩家：正面Buff时长翻倍、恢复药剂+50%、负面Buff减半；酒狐投喂蛋糕回复提升(30+5%玩家最大生命)",
            "丝绸x20 + 奇异植物x1 + 羽毛x2（织布机）", true,
            芳心织囊(), new Color(255, 190, 230)),

        new("救赎之戒", "酒狐生命+50%并持续回血；玩家受伤降为75%、伤害+20%",
            "神圣锭x10 + 力量之魂x5 + 视界之魂x5 + 恐惧之魂x5（秘银砧）", true,
            救赎之戒(), new Color(255, 220, 130)),

        new("樱眷发簪*", "酒狐减伤20%~60%（随好感），并持续给予多项增益",
            "樱花树苗x1 + 芳心织囊x1 + 不死图腾x1 + 神圣锭x5（工匠作坊）", true,
            樱眷发簪(), new Color(255, 160, 190)),

        new("梦云水晶*", "酒狐专属：背后循环播放梦幻光环；攻击附带目标5%最大生命伤害并无视防御；酒狐受击70%减伤、单次限伤5%、低血强制锁血",
            "天顶剑x1 + 终极棱镜x1 + 法术强化核心x1 + 水晶碎块x100 + 云朵x20 + 十字章护盾x1（水晶球）", true,
            梦云水晶(), new Color(160, 220, 255)),

        new("法术强化核心", "法术伤害+50%、魔力+200、每30秒一层护盾，攻击附带魔法箭",
            "眼球激光塔x1 + 巫师帽x1 + 水晶球x1 + 毁灭者徽章x1 + 利刃台风x1 + 任意大宝石x1（远古操纵机）", true,
            法术强化核心(), new Color(190, 160, 255)),

        new("超级元素史莱姆", "攻击附带流血/中毒/着火/剧毒/诅咒焰/灵液/霜冻",
            "尖刺x1 + 剧毒法杖x1 + 火山x1 + 毒液法杖x1 + 诅咒焰x1 + 黄金雨x1 + 结霜魔棒x1 + 凝胶x100（恶魔祭坛）", true,
            超级元素史莱姆(), new Color(120, 220, 130)),

        new("磐石水晶", "高抗击退，并减少5%所受弹幕伤害",
            "任意宝石x8 + 钴盾牌x1（工匠作坊）", true,
            磐石水晶(), new Color(230, 200, 140)),

        new("绀珠之药*", "仅酒狐可佩戴，相当于不死图腾，共8次",
            "不死图腾x6（工作台）", true,
            绀珠之药(), new Color(120, 200, 255)),

        new("烬华之戒", "每降低2%最大生命，攻击+0.5%；玩家+5防+受击短无敌，酒狐+15防",
            "红宝石x1 + 银锭x3 + 灰烬块x10（工作台）；或 击败克苏鲁之眼15%掉", true,
            烬华之戒(), new Color(255, 170, 90)),

        new("流转之心", "所有恢复+20%(含吸血)；最大生命+10%、防御+5%；加速自然/魔法恢复",
            "光明之魂x10 + 黑暗之魂x10 + 天界石x1（工匠作坊）", true,
            流转之心(), new Color(150, 220, 255)),

        new("紫荆冠刺", "攻击使目标防御临时降(25%+20)；受到伤害全额返还；防御+15；受到的近战伤害-20%",
            "尖刺x10 + 银锭x3 + 紫水晶x1（工匠作坊）；或 击杀尖刺史莱姆5%掉", true,
            紫荆冠刺(), new Color(190, 140, 255)),

        new("寻风之铃", "消耗品：酒狐死亡后使用，可把死去的酒狐立即唤醒复活",
            "生命水晶x1 + 任意玩偶x1 + 金锭x1（恶魔祭坛）", true,
            寻风之铃(), new Color(120, 200, 255)),
    };

    //================ B. 无合成配方，靠获取的 =================
    public static readonly 图鉴词条[] 获取饰品 =
    {
        new("法术超限*", "仅酒狐佩戴生效：酒狐武器槽+1（加在左边）、饰品槽+3（加在下面）；所有「额外武器攻击」（非主手武器被额外调用）频率+100%、伤害+20%、同时调用更多",
            "酒狐好感度达到2级（好感≥40）后自动获得", false,
            法术超限(), new Color(200, 110, 255)),
        new("嗜血之心", "造成伤害的5%回血（玩家佩戴恢复减半）",
            "击败血肉墙30%掉 / 地狱暗影宝箱开箱 / 击败吸血鬼5%掉", false,
            嗜血之心(), new Color(255, 90, 90)),

        new("不死图腾", "生命归零/死亡时恢复30%最大生命并给予增益，随后销毁",
            "野外箱子开箱 / 钓鱼约5%钓获", false,
            不死图腾(), new Color(255, 200, 90)),

        new("低吟之戒", "攻击频率+20%、所有伤害+20%",
            "击败法师类怪1%掉 / 地牢宝箱开箱", false,
            低吟之戒(), new Color(150, 230, 150)),

        new("绀珠之药（无限~）*", "绀珠之药的无限版，可无限触发酒狐护身",
            "绀珠之药丢进微光湖转化（当前实现必转）", false,
            绀珠之药无限(), new Color(150, 200, 255)),
    };

    private static int 双心之链() => ModContent.ItemType<双心之链>();
    private static int 混沌之书() => ModContent.ItemType<混沌之书>();
    private static int 魂之书() => ModContent.ItemType<魂之书>();
    private static int 芳心织囊() => ModContent.ItemType<芳心织囊>();
    private static int 救赎之戒() => ModContent.ItemType<救赎之戒>();
    private static int 樱眷发簪() => ModContent.ItemType<樱眷发簪>();
    private static int 梦云水晶() => ModContent.ItemType<梦云水晶>();
    private static int 法术强化核心() => ModContent.ItemType<法术强化核心>();
    private static int 超级元素史莱姆() => ModContent.ItemType<超级元素史莱姆>();
    private static int 磐石水晶() => ModContent.ItemType<磐石水晶>();
    private static int 绀珠之药() => ModContent.ItemType<绀珠之药>();
    private static int 烬华之戒() => ModContent.ItemType<烬华之戒>();
    private static int 流转之心() => ModContent.ItemType<流转之心>();
    private static int 紫荆冠刺() => ModContent.ItemType<紫荆冠刺>();
    private static int 寻风之铃() => ModContent.ItemType<寻风之铃>();
    private static int 嗜血之心() => ModContent.ItemType<嗜血之心>();
    private static int 不死图腾() => ModContent.ItemType<不死图腾>();
    private static int 低吟之戒() => ModContent.ItemType<低吟之戒>();
    private static int 绀珠之药无限() => ModContent.ItemType<绀珠之药无限>();
    private static int 法术超限() => ModContent.ItemType<法术超限>();
}

/// <summary>一条图鉴信息。</summary>
public sealed class 图鉴词条
{
    public readonly string 名称;
    public readonly string 效果;
    public readonly string 获取方式;
    public readonly bool 是否合成;
    public readonly int 图标物品ID;
    public readonly Color 颜色;

    public 图鉴词条(string 名称, string 效果, string 获取方式, bool 是否合成, int 图标物品ID, Color 颜色)
    {
        this.名称 = 名称;
        this.效果 = 效果;
        this.获取方式 = 获取方式;
        this.是否合成 = 是否合成;
        this.图标物品ID = 图标物品ID;
        this.颜色 = 颜色;
    }
}
