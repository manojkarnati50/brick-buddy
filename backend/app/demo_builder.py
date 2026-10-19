"""Hand-made starter models in the kid-plan format.

Used for: the seed data, the "instant" starter picker, and as an offline
builder when no ANTHROPIC_API_KEY is configured (keyword match on her idea).
"""
from __future__ import annotations

import random

from .catalog import colour_by_name


def P(part, colour, x, z, level, rotation=0):
    return {"part": part, "colour": colour, "x": x, "z": z, "level": level, "rotation": rotation}


def house(wall=13, roof=4, base=2, door=15):
    return {
        "name": "Bunny's Pink House", "say": "A cosy little house with a red roof!",
        "sections": [
            {"name": "base", "description": "Green garden plate", "steps": [[P("3032", base, 0, 0, 0)]]},
            {"name": "walls", "description": "Walls with a door", "steps": [
                [P("3009", wall, 0, 0, 1), P("3004", wall, 0, 1, 1, 90), P("3004", wall, 5, 1, 1, 90),
                 P("3004", wall, 0, 3, 1), P("3004", wall, 4, 3, 1)],
                [P("3009", wall, 0, 0, 4), P("3004", wall, 0, 1, 4, 90), P("3004", wall, 5, 1, 4, 90),
                 P("3004", wall, 0, 3, 4), P("3004", wall, 4, 3, 4)],
                [P("3009", wall, 0, 0, 7), P("3004", door, 0, 1, 7, 90), P("3004", door, 5, 1, 7, 90),
                 P("3009", wall, 0, 3, 7)],
            ]},
            {"name": "roof", "description": "Pointy roof", "steps": [
                [P("3038", roof, 0, 0, 10, 0), P("3038", roof, 3, 0, 10, 0)],
                [P("3038", roof, 0, 2, 10, 180), P("3038", roof, 3, 2, 10, 180)],
            ]},
        ],
    }


def car(body=4, accent=14):
    return {
        "name": "Zoom Zoom Car", "say": "Beep beep! Here comes your car!",
        "sections": [
            {"name": "wheels", "description": "Four round wheels", "steps": [
                [P("3062b", 0, 0, 0, 0), P("3062b", 0, 0, 1, 0), P("3062b", 0, 5, 0, 0), P("3062b", 0, 5, 1, 0)]]},
            {"name": "body", "description": "Car body", "steps": [
                [P("3795", 71, 0, 0, 3)],
                [P("3001", body, 0, 0, 4), P("3003", body, 4, 0, 4)],
            ]},
            {"name": "cabin", "description": "Seat and window", "steps": [
                [P("3003", body, 0, 0, 7), P("3039", 9, 2, 0, 7, 270), P("3022", accent, 4, 0, 7)],
                [P("3022", accent, 0, 0, 10)],
            ]},
        ],
    }


def tower(colours=(4, 25, 14, 2, 1, 22)):
    steps = [[P("3003", c, 1, 1, 1 + 3 * i)] for i, c in enumerate(colours)]
    return {
        "name": "Rainbow Tower", "say": "So tall! A rainbow tower!",
        "sections": [
            {"name": "base", "description": "Base", "steps": [[P("3031", 15, 0, 0, 0)]]},
            {"name": "tower", "description": "Stack of colours", "steps": steps},
            {"name": "top", "description": "Little top", "steps": [[P("3062b", 13, 1, 1, 1 + 3 * len(colours)), P("3062b", 14, 2, 2, 1 + 3 * len(colours))]]},
        ],
    }


def bunny(fur=15, accent=13):
    return {
        "name": "Fluffy Bunny", "say": "Hop hop! A fluffy bunny friend!",
        "sections": [
            {"name": "feet", "description": "Big feet", "steps": [[P("3021", fur, 0, 0, 0, 90)]]},
            {"name": "body", "description": "Round body", "steps": [[P("3003", fur, 0, 0, 1)], [P("3003", fur, 0, 0, 4)]]},
            {"name": "head", "description": "Head and nose", "steps": [[P("3003", fur, 0, 0, 7)], [P("4073", accent, 0, 2, 1), P("4073", accent, 1, 2, 1)]]},
            {"name": "ears", "description": "Long ears", "steps": [
                [P("3005", fur, 0, 0, 10), P("3005", fur, 1, 0, 10)],
                [P("3005", accent, 0, 0, 13), P("3005", accent, 1, 0, 13)]]},
        ],
    }


def tree(leaf=2, trunk=6, fruit=4):
    return {
        "name": "Apple Tree", "say": "A tree with a shiny red apple!",
        "sections": [
            {"name": "grass", "description": "Grass", "steps": [[P("3031", 10, 0, 0, 0)]]},
            {"name": "trunk", "description": "Trunk", "steps": [[P("3003", trunk, 1, 1, 1)], [P("3003", trunk, 1, 1, 4)]]},
            {"name": "leaves", "description": "Leaves", "steps": [
                [P("3001", leaf, 0, 1, 7)], [P("3001", leaf, 1, 0, 10, 90), P("3062b", fruit, 0, 1, 10)], [P("3003", 27, 1, 1, 13)]]},
        ],
    }


def rocket(body=15, accent=4):
    return {
        "name": "Star Rocket", "say": "Three, two, one... blast off!",
        "sections": [
            {"name": "launch pad", "description": "Launch pad", "steps": [[P("3031", 71, 0, 0, 0)]]},
            {"name": "body", "description": "Rocket body", "steps": [
                [P("3941", body, 1, 1, 1), P("3004", accent, 0, 1, 1, 90), P("3004", accent, 3, 1, 1, 90)],
                [P("3941", accent, 1, 1, 4)], [P("3941", body, 1, 1, 7)]]},
            {"name": "nose", "description": "Pointy nose", "steps": [[P("3941", accent, 1, 1, 10)], [P("3062b", 14, 1, 1, 13)]]},
        ],
    }


def flower(petal=13, centre=14):
    return {
        "name": "Happy Flower", "say": "A big happy flower for you!",
        "sections": [
            {"name": "ground", "description": "Ground", "steps": [[P("3031", 27, 0, 0, 0)]]},
            {"name": "stem", "description": "Stem", "steps": [[P("3005", 2, 1, 1, 1)], [P("3005", 2, 1, 1, 4)]]},
            {"name": "petals", "description": "Petals", "steps": [
                [P("3020", petal, 0, 1, 7)], [P("3020", petal, 1, 0, 8, 90)], [P("3022", centre, 1, 1, 9)]]},
        ],
    }


STARTERS = {
    "house": (house, ["house", "home", "cottage", "castle"]),
    "car": (car, ["car", "truck", "bus", "van", "vehicle"]),
    "tower": (tower, ["tower", "rainbow", "stack", "tall"]),
    "bunny": (bunny, ["bunny", "rabbit", "pet", "animal", "cat", "dog"]),
    "tree": (tree, ["tree", "apple", "forest", "garden"]),
    "rocket": (rocket, ["rocket", "space", "moon", "star"]),
    "flower": (flower, ["flower", "rose", "plant"]),
}

STARTER_EMOJI = {"house": "🏠", "car": "🚗", "tower": "🌈", "bunny": "🐰", "tree": "🌳", "rocket": "🚀", "flower": "🌸"}


def starter(key: str) -> dict:
    return STARTERS[key][0]()


def from_idea(idea: str) -> dict:
    words = idea.lower()
    key = next((k for k, (_, kws) in STARTERS.items() if any(w in words for w in kws)), None)
    key = key or random.choice(list(STARTERS))
    plan = STARTERS[key][0]()
    # recolour the main colour if she named one
    named = [c for c in (colour_by_name(w) for w in words.replace(",", " ").split()) if c is not None]
    if named:
        main = _main_colour(plan)
        for sec in plan["sections"]:
            for step in sec["steps"]:
                for pl in step:
                    if pl["colour"] == main:
                        pl["colour"] = named[0]
    return plan


def _main_colour(plan) -> int:
    from collections import Counter
    c = Counter(pl["colour"] for s in plan["sections"] for st in s["steps"] for pl in st)
    return c.most_common(1)[0][0]
