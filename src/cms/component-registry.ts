import Button from "../components/primitives/Button.astro";
import Heading from "../components/primitives/Heading.astro";
import Image from "../components/primitives/Image.astro";
import Section from "../components/primitives/Section.astro";
import Stack from "../components/primitives/Stack.astro";
import Text from "../components/primitives/Text.astro";
import type { ComponentType } from "./document-types";

export const componentRegistry = {
  Section,
  Stack,
  Heading,
  Text,
  Image,
  Button,
} satisfies Record<ComponentType, unknown>;
