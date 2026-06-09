import {
  UserGroupIcon,
  HomeIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";

export default async function Icons() {
  await new Promise((resolve) => setTimeout(resolve, 5000));

  return (
    <div className="flex gap-2">
      <UserGroupIcon className="w-8 h-8" />
      <HomeIcon className="w-8 h-8" />
      <DocumentDuplicateIcon className="w-8 h-8" />
    </div>
  );
}
